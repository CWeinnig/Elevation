using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;
using Elevation.Services;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _env;
    private readonly IEmailService _email;

    public OrdersController(AppDbContext context, IWebHostEnvironment env, IEmailService email)
    {
        _context = context;
        _env = env;
        _email = email;
    }

    // ── Create order or quote request ────────────────────────────────────────

    [HttpPost]
    public async Task<ActionResult<OrderDto>> CreateOrder(CreateOrderDto dto)
    {
        if (!dto.IsQuoteRequest && string.IsNullOrEmpty(dto.SquarePaymentId))
            return BadRequest("Payment verification failed: Missing SquarePaymentId.");

        // 1. Resolve recipient
        string recipientEmail;
        int? resolvedUserId = null;

        if (dto.UserId > 0)
        {
            var user = await _context.Users.FindAsync(dto.UserId);
            if (user == null) return BadRequest("User does not exist.");
            recipientEmail = user.Email;
            resolvedUserId = dto.UserId;
        }
        else if (!string.IsNullOrEmpty(dto.GuestEmail))
        {
            recipientEmail = dto.GuestEmail;
        }
        else
        {
            return BadRequest("Either a UserId or GuestEmail is required.");
        }

        // 2. Validate files
        var filesToAttach = new List<UploadedFile>();
        foreach (var fileId in dto.FileIds)
        {
            var file = await _context.UploadedFiles.FindAsync(fileId);
            if (file == null) return BadRequest($"File ID {fileId} not found.");
            if (file.OrderId.HasValue) return BadRequest($"File ID {fileId} is already attached to an order.");
            filesToAttach.Add(file);
        }

        // 3. Validate products and build items
        var orderItems = new List<OrderItem>();
        decimal totalPrice = 0;

        foreach (var itemDto in dto.Items)
        {
            var dbProduct = await _context.Products.FindAsync(itemDto.ProductId);
            if (dbProduct == null) return BadRequest($"Product ID {itemDto.ProductId} not found.");

            decimal itemCost = dbProduct.BasePrice;
            var orderOptions = new List<OrderOption>();

            foreach (var optDto in itemDto.Options)
            {
                var dbOption = await _context.ProductOptions.FindAsync(optDto.ProductOptionId);
                if (dbOption == null)
                    return BadRequest($"ProductOption ID {optDto.ProductOptionId} not found.");
                if (dbOption.ProductId != itemDto.ProductId)
                    return BadRequest($"ProductOption {optDto.ProductOptionId} does not belong to Product {itemDto.ProductId}.");

                itemCost += dbOption.PriceModifier;
                orderOptions.Add(new OrderOption
                {
                    OptionName = dbOption.OptionName,
                    OptionValue = dbOption.OptionValue,
                    PriceModifier = dbOption.PriceModifier
                });
            }

            totalPrice += itemCost * itemDto.Quantity;
            orderItems.Add(new OrderItem
            {
                ProductId = itemDto.ProductId,
                Quantity = itemDto.Quantity,
                UnitPrice = itemCost,
                Options = orderOptions
            });
        }

        // 4. Write to DB
        var initialStatus = dto.IsQuoteRequest ? "QuoteRequested" : "Paid";

        var order = new Order
        {
            UserId = resolvedUserId,
            GuestEmail = resolvedUserId.HasValue ? string.Empty : recipientEmail,
            SquarePaymentId = dto.SquarePaymentId,
            Status = initialStatus,
            TotalPrice = totalPrice,
            DesignNotes = dto.DesignNotes,
            CustomerPhone = dto.CustomerPhone ?? string.Empty,
            IsQuoteRequest = dto.IsQuoteRequest,
            PaymentToken = dto.IsQuoteRequest ? Guid.NewGuid().ToString("N") : string.Empty,
            CreatedAt = DateTime.UtcNow,
            Items = orderItems,
            Notifications = new List<Notification>(),
            UploadedFiles = new List<UploadedFile>()
        };

        _context.Orders.Add(order);
        await _context.SaveChangesAsync();

        foreach (var file in filesToAttach)
            file.OrderId = order.Id;

        var notifType = dto.IsQuoteRequest ? "Email - Quote Received" : "Email - Order Confirmed";
        order.Notifications.Add(new Notification
        {
            OrderId = order.Id,
            Type = notifType,
            Recipient = recipientEmail,
            SentAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        // 5. Send confirmation email
        var emailItems = orderItems.Select(i => new EmailLineItem
        {
            ProductName = _context.Products.Find(i.ProductId)?.Name ?? "Product",
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice
        }).ToList();

        if (dto.IsQuoteRequest)
            await _email.SendQuoteReceivedAsync(recipientEmail, order.Id, totalPrice, emailItems, dto.DesignNotes ?? "");
        else
            await _email.SendOrderConfirmedAsync(recipientEmail, order.Id, totalPrice, emailItems);

        var created = await GetOrderWithIncludes(order.Id);
        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, MapToDto(created!));
    }

    // ── Get by ID ─────────────────────────────────────────────────────────────

    [HttpGet("{id}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var order = await GetOrderWithIncludes(id);
        if (order == null) return NotFound();
        return MapToDto(order);
    }

    // ── Get all orders for user ───────────────────────────────────────────────

    [HttpGet("user/{userId}")]
    public async Task<ActionResult<IEnumerable<OrderDto>>> GetOrdersForUser(int userId)
    {
        var orders = await _context.Orders
            .Include(o => o.User)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Where(o => o.UserId == (int?)userId)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return Ok(orders.Select(MapToDto));
    }

    // ── Get all orders (admin) ────────────────────────────────────────────────

    [HttpGet]
    public async Task<ActionResult<IEnumerable<OrderDto>>> GetAllOrders()
    {
        var orders = await _context.Orders
            .Include(o => o.User)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return Ok(orders.Select(MapToDto));
    }

    // ── Update status (admin) ─────────────────────────────────────────────────

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateOrderStatusDto dto)
    {
        var order = await GetOrderWithIncludes(id);
        if (order == null) return NotFound();

        order.Status = dto.NewStatus;

        var recipient = await ResolveRecipient(order);

        if (!string.IsNullOrEmpty(recipient))
        {
            string? notifType = dto.NewStatus switch
            {
                "Completed" => "Email - Order Complete",
                "ProofSent" => "Email - Proof Ready for Review",
                "AwaitingPayment" => "Email - Proof Approved, Payment Required",
                _ => null
            };

            if (notifType != null)
            {
                _context.Notifications.Add(new Notification
                {
                    OrderId = order.Id,
                    Type = notifType,
                    Recipient = recipient,
                    SentAt = DateTime.UtcNow
                });
            }
        }

        await _context.SaveChangesAsync();

        // Send actual email based on new status
        if (!string.IsNullOrEmpty(recipient))
        {
            if (dto.NewStatus == "Completed")
                await _email.SendOrderCompletedAsync(recipient, order.Id, order.TotalPrice);

            else if (dto.NewStatus == "ProofSent")
            {
                // Build a direct proof download URL from the most recent proof file
                var proofFile = order.UploadedFiles?
                    .Where(f => f.OriginalFileName.StartsWith("PROOF_"))
                    .OrderByDescending(f => f.UploadedAt)
                    .FirstOrDefault();

                var proofUrl = proofFile != null
                    ? $"{Request.Scheme}://{Request.Host}/api/Files/{proofFile.Id}/download"
                    : $"{Request.Scheme}://{Request.Host}";

                await _email.SendProofReadyAsync(recipient, order.Id, proofUrl);
            }
        }

        return Ok(new { message = "Status updated", currentStatus = order.Status });
    }

    // ── Upload proof (admin) ──────────────────────────────────────────────────

    [HttpPost("{id}/proof")]
    public async Task<IActionResult> UploadProof(int id, IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file received.");

        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        if (!order.IsQuoteRequest)
            return BadRequest("This order is not a quote request.");

        var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsRoot)) Directory.CreateDirectory(uploadsRoot);

        var ext = Path.GetExtension(file.FileName);
        var storedName = $"proof_{id}_{Guid.NewGuid():N}{ext}";
        var physicalPath = Path.Combine(uploadsRoot, storedName);

        using (var stream = new FileStream(physicalPath, FileMode.Create))
            await file.CopyToAsync(stream);

        var proofFile = new UploadedFile
        {
            OrderId = order.Id,
            OriginalFileName = $"PROOF_{file.FileName}",
            StoredFileName = storedName,
            FilePath = $"/uploads/{storedName}",
            UploadedAt = DateTime.UtcNow
        };
        _context.UploadedFiles.Add(proofFile);

        order.Status = "ProofSent";

        var recipient = await ResolveRecipient(order);
        if (!string.IsNullOrEmpty(recipient))
        {
            _context.Notifications.Add(new Notification
            {
                OrderId = order.Id,
                Type = "Email - Proof Ready for Review",
                Recipient = recipient,
                SentAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        // Send proof-ready email with direct download link
        if (!string.IsNullOrEmpty(recipient))
        {
            var proofUrl = Url.Action("DownloadFile", "Files", new { id = proofFile.Id }, Request.Scheme)
                           ?? $"{Request.Scheme}://{Request.Host}";
            await _email.SendProofReadyAsync(recipient, order.Id, proofUrl);
        }

        return Ok(new
        {
            message = "Proof uploaded, status set to ProofSent",
            proofFileId = proofFile.Id,
            downloadUrl = Url.Action("DownloadFile", "Files", new { id = proofFile.Id }, Request.Scheme)
        });
    }

    // ── Approve proof via token (email link flow) ─────────────────────────────

    [HttpPost("{id}/approve-proof")]
    public async Task<IActionResult> ApproveProof(int id, [FromBody] ApproveProofDto dto)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        if (!order.IsQuoteRequest)
            return BadRequest("This order is not a quote request.");

        if (order.Status != "ProofSent")
            return BadRequest($"Cannot approve proof — current status is '{order.Status}'.");

        if (order.PaymentToken != dto.PaymentToken)
            return Unauthorized("Invalid payment token.");

        order.Status = "AwaitingPayment";

        var paymentUrl = $"{Request.Scheme}://{Request.Host}/?payOrder={order.Id}&token={order.PaymentToken}";

        var recipient = await ResolveRecipient(order);
        if (!string.IsNullOrEmpty(recipient))
        {
            _context.Notifications.Add(new Notification
            {
                OrderId = order.Id,
                Type = $"Email - Payment Link: {paymentUrl}",
                Recipient = recipient,
                SentAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        if (!string.IsNullOrEmpty(recipient))
            await _email.SendPaymentLinkAsync(recipient, order.Id, order.TotalPrice, paymentUrl);

        var url = $"/?payOrder={order.Id}&token={order.PaymentToken}";
        return Ok(new { message = "Proof approved", paymentUrl = url });
    }

    // ── Approve proof (customer account page) ────────────────────────────────

    [HttpPost("{id}/customer-approve")]
    public async Task<IActionResult> CustomerApproveProof(int id, [FromBody] CustomerApproveDto dto)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        if (!order.IsQuoteRequest)
            return BadRequest("This order is not a quote request.");

        if (order.Status != "ProofSent")
            return BadRequest($"Cannot approve proof — current status is '{order.Status}'.");

        if (!order.UserId.HasValue || order.UserId.Value != dto.UserId)
            return Unauthorized("You are not authorized to approve this order.");

        order.Status = "AwaitingPayment";

        var paymentUrl = $"{Request.Scheme}://{Request.Host}/?payOrder={order.Id}&token={order.PaymentToken}";

        var recipient = await ResolveRecipient(order);
        if (!string.IsNullOrEmpty(recipient))
        {
            _context.Notifications.Add(new Notification
            {
                OrderId = order.Id,
                Type = $"Email - Payment Link: {paymentUrl}",
                Recipient = recipient,
                SentAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        if (!string.IsNullOrEmpty(recipient))
            await _email.SendPaymentLinkAsync(recipient, order.Id, order.TotalPrice, paymentUrl);

        return Ok(new { message = "Proof approved", paymentUrl });
    }

    // ── Resolve payment link ──────────────────────────────────────────────────

    [HttpGet("{id}/payment-info")]
    public async Task<IActionResult> GetPaymentInfo(int id, [FromQuery] string token)
    {
        var order = await GetOrderWithIncludes(id);
        if (order == null) return NotFound();

        if (order.PaymentToken != token)
            return Unauthorized("Invalid payment token.");

        if (order.Status != "AwaitingPayment")
            return BadRequest($"Order is not awaiting payment (status: {order.Status}).");

        return Ok(new
        {
            orderId = order.Id,
            totalPrice = order.TotalPrice,
            email = string.IsNullOrEmpty(order.GuestEmail)
                    ? (await _context.Users.FindAsync(order.UserId))?.Email ?? string.Empty
                    : order.GuestEmail,
            items = order.Items?.Select(i => new
            {
                productName = i.Product?.Name ?? string.Empty,
                quantity = i.Quantity,
                unitPrice = i.UnitPrice
            })
        });
    }

    // ── Complete payment for a quote order ────────────────────────────────────

    [HttpPost("{id}/complete-payment")]
    public async Task<IActionResult> CompletePayment(int id, [FromBody] CompletePaymentDto dto)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        if (order.PaymentToken != dto.PaymentToken)
            return Unauthorized("Invalid payment token.");

        if (order.Status != "AwaitingPayment")
            return BadRequest($"Order is not awaiting payment (status: {order.Status}).");

        order.SquarePaymentId = dto.SquarePaymentId;
        order.Status = "Paid";
        order.PaymentToken = string.Empty;

        var recipient = await ResolveRecipient(order);
        if (!string.IsNullOrEmpty(recipient))
        {
            _context.Notifications.Add(new Notification
            {
                OrderId = order.Id,
                Type = "Email - Order Confirmed (Post-Proof Payment)",
                Recipient = recipient,
                SentAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        if (!string.IsNullOrEmpty(recipient))
        {
            var items = (await GetOrderWithIncludes(order.Id))?.Items?
                .Select(i => new EmailLineItem
                {
                    ProductName = i.Product?.Name ?? "Product",
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice
                }).ToList() ?? new();

            await _email.SendOrderConfirmedAsync(recipient, order.Id, order.TotalPrice, items);
        }

        return Ok(new { message = "Payment recorded", currentStatus = order.Status });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<Order?> GetOrderWithIncludes(int id) =>
        await _context.Orders
            .Include(o => o.User)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Include(o => o.Notifications)
            .FirstOrDefaultAsync(o => o.Id == id);

    private async Task<string?> ResolveRecipient(Order order)
    {
        if (order.UserId.HasValue)
        {
            var user = await _context.Users.FindAsync(order.UserId.Value);
            return user?.Email;
        }
        return string.IsNullOrEmpty(order.GuestEmail) ? null : order.GuestEmail;
    }

    private static OrderDto MapToDto(Order order) => new OrderDto
    {
        Id = order.Id,
        UserId = order.UserId ?? 0,
        GuestEmail = order.GuestEmail,
        Status = order.Status,
        TotalPrice = order.TotalPrice,
        CreatedAt = order.CreatedAt,
        DesignNotes = order.DesignNotes,
        CustomerPhone = order.CustomerPhone,
        IsQuoteRequest = order.IsQuoteRequest,
        // Resolve name and email from the linked User or fall back to guest email
        CustomerName = order.User?.Name ?? string.Empty,
        CustomerEmail = order.User?.Email ?? order.GuestEmail,
        Items = order.Items?.Select(i => new OrderItemDto
        {
            Id = i.Id,
            ProductId = i.ProductId,
            ProductName = i.Product?.Name ?? string.Empty,
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice,
            Options = i.Options?.Select(o => new OrderOptionDto
            {
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            }).ToList() ?? new()
        }).ToList() ?? new(),
        UploadedFiles = order.UploadedFiles?.Select(f => new UploadedFileDto
        {
            Id = f.Id,
            OrderId = f.OrderId,
            OriginalFileName = f.OriginalFileName,
            UploadedAt = f.UploadedAt,
            DownloadUrl = $"/api/Files/{f.Id}/download"
        }).ToList() ?? new()
    };
}

public class ApproveProofDto { public string PaymentToken { get; set; } = string.Empty; }
public class CustomerApproveDto { public int UserId { get; set; } }
public class CompletePaymentDto { public string PaymentToken { get; set; } = string.Empty; public string SquarePaymentId { get; set; } = string.Empty; }