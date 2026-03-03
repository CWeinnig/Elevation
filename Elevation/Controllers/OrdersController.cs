using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _context;

    public OrdersController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> CreateOrder(CreateOrderDto dto)
    {
        if (string.IsNullOrEmpty(dto.SquarePaymentId))
            return BadRequest("Payment verification failed: Missing SquarePaymentId.");

        // ── Validate everything BEFORE writing anything to the database ──

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

        // 2. Validate all files upfront — before any SaveChanges
        var filesToAttach = new List<UploadedFile>();
        foreach (var fileId in dto.FileIds)
        {
            var file = await _context.UploadedFiles.FindAsync(fileId);
            if (file == null)
                return BadRequest($"File ID {fileId} not found.");
            if (file.OrderId.HasValue)
                return BadRequest($"File ID {fileId} is already attached to an order.");
            filesToAttach.Add(file);
        }

        // 3. Validate all products and options upfront
        var orderItems = new List<OrderItem>();
        decimal calculatedTotal = 0;

        foreach (var itemDto in dto.Items)
        {
            var dbProduct = await _context.Products.FindAsync(itemDto.ProductId);
            if (dbProduct == null)
                return BadRequest($"Product ID {itemDto.ProductId} not found.");

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

            calculatedTotal += itemCost * itemDto.Quantity;

            orderItems.Add(new OrderItem
            {
                ProductId = itemDto.ProductId,
                Quantity = itemDto.Quantity,
                UnitPrice = itemCost,
                Options = orderOptions
            });
        }

        // ── All validation passed — now write to the database ──

        var order = new Order
        {
            UserId = resolvedUserId,
            SquarePaymentId = dto.SquarePaymentId,
            Status = "Paid",
            TotalPrice = calculatedTotal,
            CreatedAt = DateTime.UtcNow,
            Items = orderItems,
            Notifications = new List<Notification>(),
            UploadedFiles = new List<UploadedFile>()
        };

        _context.Orders.Add(order);

        // SaveChanges here so order.Id is populated before we set file.OrderId
        // and before creating the notification with a valid OrderId.
        await _context.SaveChangesAsync();

        // Attach files now that order.Id exists
        foreach (var file in filesToAttach)
            file.OrderId = order.Id;

        // Create confirmation notification with the real order.Id
        order.Notifications.Add(new Notification
        {
            OrderId = order.Id,
            Type = "Email",
            Recipient = recipientEmail,
            SentAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        var created = await GetOrderWithIncludes(order.Id);
        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, MapToDto(created!));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var order = await GetOrderWithIncludes(id);
        if (order == null) return NotFound();
        return MapToDto(order);
    }

    [HttpGet("user/{userId}")]
    public async Task<ActionResult<IEnumerable<OrderDto>>> GetOrdersForUser(int userId)
    {
        var orders = await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Where(o => o.UserId == (int?)userId)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return Ok(orders.Select(MapToDto));
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateOrderStatusDto dto)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        order.Status = dto.NewStatus;

        if (dto.NewStatus == "Completed")
        {
            // Notify the right recipient: registered user or guest
            string? recipient = null;
            if (order.UserId.HasValue)
            {
                var user = await _context.Users.FindAsync(order.UserId.Value);
                recipient = user?.Email;
            }
            else if (!string.IsNullOrEmpty(order.GuestEmail))
            {
                recipient = order.GuestEmail;
            }

            if (!string.IsNullOrEmpty(recipient))
            {
                _context.Notifications.Add(new Notification
                {
                    OrderId = order.Id,
                    Type = "Email - Order Complete",
                    Recipient = recipient,
                    SentAt = DateTime.UtcNow
                });
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Status updated", currentStatus = order.Status });
    }

    private async Task<Order?> GetOrderWithIncludes(int id) =>
        await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Include(o => o.Notifications)
            .FirstOrDefaultAsync(o => o.Id == id);

    private static OrderDto MapToDto(Order order) => new OrderDto
    {
        Id = order.Id,
        UserId = order.UserId ?? 0,
        Status = order.Status,
        TotalPrice = order.TotalPrice,
        CreatedAt = order.CreatedAt,
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