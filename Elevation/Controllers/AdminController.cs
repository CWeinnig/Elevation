using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;

    public AdminController(AppDbContext context, IConfiguration config)
    {
        _context = context;
        _config = config;
    }

   
    [HttpPost("login")]
    public IActionResult Login([FromBody] AdminLoginRequest req)
    {
        var expectedUser = _config["Admin:Username"];
        var expectedPass = _config["Admin:Password"];

        if (string.IsNullOrEmpty(expectedUser) || string.IsNullOrEmpty(expectedPass))
            return StatusCode(500, new { message = "Admin credentials are not configured on the server." });

        if (req.Username != expectedUser || req.Password != expectedPass)
            return Unauthorized(new { message = "Invalid credentials." });

        var token = _config["Admin:Token"] ?? "admin-token-djed";
        return Ok(new { success = true, token });
    }

    
    [HttpGet("products")]
    public async Task<ActionResult<IEnumerable<object>>> GetProducts()
    {
        var products = await _context.Products
            .Include(p => p.Options)
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.Description,
                p.BasePrice,
                p.IsActive,
                Options = p.Options!.Select(o => new
                {
                    o.Id,
                    o.OptionName,
                    o.OptionValue,
                    o.PriceModifier
                })
            })
            .ToListAsync();

        return Ok(products);
    }

    
    [HttpPost("products")]
    public async Task<ActionResult<object>> CreateProduct([FromBody] AdminProductDto dto)
    {
        var product = new Product
        {
            Name        = dto.Name,
            Description = dto.Description,
            BasePrice   = dto.BasePrice,
            IsActive    = true
        };

        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return Ok(new { product.Id, product.Name, product.Description, product.BasePrice, product.IsActive });
    }

    
    [HttpPut("products/{id}")]
    public async Task<IActionResult> UpdateProduct(int id, [FromBody] AdminProductDto dto)
    {
        var product = await _context.Products.FindAsync(id);
        if (product is null) return NotFound();

        product.Name        = dto.Name;
        product.Description = dto.Description;
        product.BasePrice   = dto.BasePrice;

        await _context.SaveChangesAsync();

        return Ok(new { product.Id, product.Name, product.Description, product.BasePrice, product.IsActive });
    }

    
    [HttpDelete("products/{id}")]
    public async Task<IActionResult> DeleteProduct(int id)
    {
        var product = await _context.Products.FindAsync(id);
        if (product is null) return NotFound();

        _context.Products.Remove(product);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Deleted." });
    }
}



public class AdminLoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class AdminProductDto
{
    public string  Name        { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal BasePrice   { get; set; }
}