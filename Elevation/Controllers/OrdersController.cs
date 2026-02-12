using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;

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

    // POST: api/Orders
    [HttpPost]
    public async Task<ActionResult<Order>> CreateOrder(Order order)
    {
        // 1. Validation: Must have a User and a Payment ID from Square
        if (string.IsNullOrEmpty(order.SquarePaymentId))
            return BadRequest("Payment verification failed: Missing SquarePaymentId.");

        var user = await _context.Users.FindAsync(order.UserId);
        if (user == null) return BadRequest("User does not exist.");

        // 2. Server-Side Price Calculation
        decimal calculatedTotal = 0;

        // We must initialize these lists if null to avoid crashes
        if (order.Items == null) order.Items = new List<OrderItem>();
        if (order.Notifications == null) order.Notifications = new List<Notification>();

        foreach (var item in order.Items)
        {
            // Lookup the REAL product price
            var dbProduct = await _context.Products.FindAsync(item.ProductId);
            if (dbProduct == null) return BadRequest($"Product ID {item.ProductId} not found.");

            // Base Cost
            decimal itemCost = dbProduct.BasePrice;

            // Add Option Costs (if any)
            if (item.Options != null)
            {
                foreach (var opt in item.Options)
                {
                    // For safety, we trust the modifier sent, but in a strict app 
                    // you would lookup the ProductOption table here too.
                    itemCost += opt.PriceModifier;
                }
            }

            // Set the final snapshot price for this item
            item.UnitPrice = itemCost;
            calculatedTotal += (itemCost * item.Quantity);
        }

        order.TotalPrice = calculatedTotal;
        order.Status = "Paid"; // Default to Paid since we checked PaymentId
        order.CreatedAt = DateTime.UtcNow;

        // 3. Create a Notification Record (The "Real" way to queue emails)
        order.Notifications.Add(new Notification
        {
            Type = "Email",
            Recipient = user.Email,
            SentAt = DateTime.UtcNow
        });

        _context.Orders.Add(order);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, order);
    }

    // GET: api/Orders/5
    [HttpGet("{id}")]
    public async Task<ActionResult<Order>> GetOrder(int id)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
                .ThenInclude(i => i.Options)
            .Include(o => o.UploadedFiles)
            .Include(o => o.Notifications)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null) return NotFound();
        return order;
    }

    // PUT: api/Orders/5/status
    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] string newStatus)
    {
        var order = await _context.Orders.FindAsync(id);
        if (order == null) return NotFound();

        order.Status = newStatus;

        // Log notification if completed
        if (newStatus == "Completed")
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
}