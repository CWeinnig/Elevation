using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.Data;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;

    public AdminController(AppDbContext context)
    {
        _context = context;
    }

    // POST api/admin/login
    [HttpPost("login")]
    public IActionResult Login([FromBody] AdminLoginRequest req)
    {
        if (req.Username == "admin" && req.Password == "123")
            return Ok(new { success = true, token = "admin-token-djed" });

        return Unauthorized(new { message = "Invalid credentials" });
    }

    // GET api/admin/products
    [HttpGet("products")]
    public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
    {
        var products = await _context.Products
            .Include(p => p.Options)
            .ToListAsync();
        return Ok(products);
    }

    // POST api/admin/products
    [HttpPost("products")]
    public async Task<ActionResult<Product>> CreateProduct([FromBody] AdminProductDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { message = "Product name is required" });

        var product = new Product
        {
            Name        = dto.Name,
            Description = dto.Description,
            BasePrice   = dto.BasePrice,
            IsActive    = true
        };

        _context.Products.Add(product);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetProducts), new { id = product.Id }, product);
    }

    // PUT api/admin/products/{id}
    [HttpPut("products/{id}")]
    public async Task<ActionResult<Product>> UpdateProduct(int id, [FromBody] AdminProductDto dto)
    {
        var product = await _context.Products.FindAsync(id);
        if (product == null) return NotFound(new { message = "Product not found" });

        product.Name        = dto.Name;
        product.Description = dto.Description;
        product.BasePrice   = dto.BasePrice;

        await _context.SaveChangesAsync();
        return Ok(product);
    }

    // DELETE api/admin/products/{id}
    [HttpDelete("products/{id}")]
    public async Task<IActionResult> DeleteProduct(int id)
    {
        var product = await _context.Products.FindAsync(id);
        if (product == null) return NotFound(new { message = "Product not found" });

        _context.Products.Remove(product);
        await _context.SaveChangesAsync();
        return NoContent();
    }
}

public class AdminLoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class AdminProductDto
{
    public string Name        { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BasePrice  { get; set; }
}