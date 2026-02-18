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

        var user = await _context.Users.FindAsync(dto.UserId);
        if (user == null) return BadRequest("User does not exist.");

        var order = new Order
        {
            UserId = dto.UserId,
            SquarePaymentId = dto.SquarePaymentId,
            Status = "Paid",
            CreatedAt = DateTime.UtcNow,
            Items = new List<OrderItem>(),
            Notifications = new List<Notification>()
        };

        decimal calculatedTotal = 0;

        foreach (var itemDto in dto.Items)
        {
            var dbProduct = await _context.Products.FindAsync(itemDto.ProductId);
            if (dbProduct == null) return BadRequest($"Product ID {itemDto.ProductId} not found.");

            decimal itemCost = dbProduct.BasePrice;
            var orderOptions = new List<OrderOption>();

            foreach (var optDto in itemDto.Options)
            {
                var dbOption = await _context.ProductOptions.FindAsync(optDto.ProductOptionId);
                if (dbOption == null) return BadRequest($"ProductOption ID {optDto.ProductOptionId} not found.");
                if (dbOption.ProductId != itemDto.ProductId) return BadRequest($"ProductOption {optDto.ProductOptionId} does not belong to Product {itemDto.ProductId}.");

                itemCost += dbOption.PriceModifier;

                orderOptions.Add(new OrderOption
                {
                    OptionName = dbOption.OptionName,
                    OptionValue = dbOption.OptionValue,
                    PriceModifier = dbOption.PriceModifier
                });
            }

            calculatedTotal += itemCost * itemDto.Quantity;

            order.Items.Add(new OrderItem
            {
                ProductId = itemDto.ProductId,
                Quantity = itemDto.Quantity,
                UnitPrice = itemCost,
                Options = orderOptions
            });
        }

        order.TotalPrice = calculatedTotal;

        order.Notifications.Add(new Notification
        {
            Type = "Email",
            Recipient = user.Email,
            SentAt = DateTime.UtcNow
        });

        _context.Orders.Add(order);
        await _context.SaveChangesAsync();

        foreach (var fileId in dto.FileIds)
        {
            var file = await _context.UploadedFiles.FindAsync(fileId);
            if (file == null) return BadRequest($"File ID {fileId} not found.");
            if (file.OrderId.HasValue) return BadRequest($"File ID {fileId} is already attached to an order.");
            file.OrderId = order.Id;
        }

        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, MapToDto(order));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .Include(o => o.Items)
                .ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Include(o => o.Notifications)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null) return NotFound();
        return MapToDto(order);
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateOrderStatusDto dto)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        order.Status = dto.NewStatus;

        if (dto.NewStatus == "Completed")
        {
            var user = await _context.Users.FindAsync(order.UserId);
            if (user != null)
            {
                _context.Notifications.Add(new Notification
                {
                    OrderId = order.Id,
                    Type = "Email - Order Complete",
                    Recipient = user.Email,
                    SentAt = DateTime.UtcNow
                });
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Status updated", currentStatus = order.Status });
    }

    private static OrderDto MapToDto(Order order) => new OrderDto
    {
        Id = order.Id,
        UserId = order.UserId,
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
            UploadedAt = f.UploadedAt
        }).ToList() ?? new()
    };
}