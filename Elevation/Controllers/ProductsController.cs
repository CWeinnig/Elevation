using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ProductsController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/Products  (public — active only)
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductDto>>> GetProducts()
    {
        return await _context.Products
            .Include(p => p.Options)
            .Include(p => p.PriceTiers)
            .Where(p => p.IsActive)
            .OrderBy(p => p.Name)
            .Select(p => MapToDto(p))
            .ToListAsync();
    }

    // GET: api/Products/all  (admin — includes inactive products)
    [HttpGet("all")]
    public async Task<ActionResult<IEnumerable<ProductDto>>> GetAllProducts()
    {
        // Simple role check via header — set by frontend when logged in as Admin
        var role = Request.Headers["X-User-Role"].FirstOrDefault();
        if (role != "Admin")
            return Forbid();

        return await _context.Products
            .Include(p => p.Options)
            .Include(p => p.PriceTiers)
            .OrderBy(p => p.Name)
            .Select(p => MapToDto(p))
            .ToListAsync();
    }

    // GET: api/Products/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<ProductDto>> GetProduct(int id)
    {
        var product = await _context.Products
            .Include(p => p.Options)
            .Include(p => p.PriceTiers)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null) return NotFound();
        return MapToDto(product);
    }

    // POST: api/Products  (admin only)
    [HttpPost]
    public async Task<ActionResult<ProductDto>> PostProduct(CreateProductDto dto)
    {
        var role = Request.Headers["X-User-Role"].FirstOrDefault();
        if (role != "Admin")
            return Forbid();

        var product = new Product
        {
            Name = dto.Name,
            Description = dto.Description,
            BasePrice = dto.BasePrice,
            MinPrice = dto.MinPrice,
            MaxPrice = dto.MaxPrice,
            IsActive = true,
            Options = dto.Options.Select(o => new ProductOption
            {
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            }).ToList(),
            PriceTiers = dto.PriceTiers.Select(t => new PriceTier
            {
                MinQty = t.MinQty,
                Price = t.Price,
                Label = t.Label
            }).ToList()
        };

        _context.Products.Add(product);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, MapToDto(product));
    }

    // PUT: api/Products/{id}  (admin only)
    [HttpPut("{id}")]
    public async Task<IActionResult> PutProduct(int id, UpdateProductDto dto)
    {
        var role = Request.Headers["X-User-Role"].FirstOrDefault();
        if (role != "Admin")
            return Forbid();

        var product = await _context.Products
            .Include(p => p.Options)
            .Include(p => p.PriceTiers)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null) return NotFound();

        product.Name = dto.Name;
        product.Description = dto.Description;
        product.BasePrice = dto.BasePrice;
        product.MinPrice = dto.MinPrice;
        product.MaxPrice = dto.MaxPrice;
        product.IsActive = dto.IsActive;

        // Replace options
        product.Options!.Clear();
        foreach (var o in dto.Options)
            product.Options.Add(new ProductOption
            {
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            });

        // Replace price tiers
        product.PriceTiers!.Clear();
        foreach (var t in dto.PriceTiers)
            product.PriceTiers.Add(new PriceTier
            {
                MinQty = t.MinQty,
                Price = t.Price,
                Label = t.Label
            });

        await _context.SaveChangesAsync();
        return NoContent();
    }

    // DELETE: api/Products/{id}  (admin only — soft delete / deactivate)
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeactivateProduct(int id)
    {
        var role = Request.Headers["X-User-Role"].FirstOrDefault();
        if (role != "Admin")
            return Forbid();

        var product = await _context.Products.FindAsync(id);
        if (product == null) return NotFound();
        product.IsActive = false;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static ProductDto MapToDto(Product p) => new ProductDto
    {
        Id = p.Id,
        Name = p.Name,
        Description = p.Description,
        BasePrice = p.BasePrice,
        MinPrice = p.MinPrice,
        MaxPrice = p.MaxPrice,
        Options = p.Options?.Select(o => new ProductOptionDto
        {
            Id = o.Id,
            OptionName = o.OptionName,
            OptionValue = o.OptionValue,
            PriceModifier = o.PriceModifier
        }).ToList() ?? new(),
        PriceTiers = p.PriceTiers?.OrderBy(t => t.MinQty).Select(t => new PriceTierDto
        {
            Id = t.Id,
            MinQty = t.MinQty,
            Price = t.Price,
            Label = t.Label
        }).ToList() ?? new()
    };
}