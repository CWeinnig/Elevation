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

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductDto>>> GetProducts()
    {
        return await _context.Products
            .Include(p => p.Options)
            .Where(p => p.IsActive)
            .Select(p => new ProductDto
            {
                Id = p.Id,
                Name = p.Name,
                Description = p.Description,
                BasePrice = p.BasePrice,
                Options = p.Options!.Select(o => new ProductOptionDto
                {
                    Id = o.Id,
                    OptionName = o.OptionName,
                    OptionValue = o.OptionValue,
                    PriceModifier = o.PriceModifier
                }).ToList()
            })
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ProductDto>> GetProduct(int id)
    {
        var product = await _context.Products
            .Include(p => p.Options)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null) return NotFound();

        return new ProductDto
        {
            Id = product.Id,
            Name = product.Name,
            Description = product.Description,
            BasePrice = product.BasePrice,
            Options = product.Options!.Select(o => new ProductOptionDto
            {
                Id = o.Id,
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            }).ToList()
        };
    }

    [HttpPost]
    public async Task<ActionResult<ProductDto>> PostProduct(CreateProductDto dto)
    {
        var product = new Product
        {
            Name = dto.Name,
            Description = dto.Description,
            BasePrice = dto.BasePrice,
            IsActive = true,
            Options = dto.Options.Select(o => new ProductOption
            {
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            }).ToList()
        };

        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutProduct(int id, UpdateProductDto dto)
    {
        var product = await _context.Products
            .Include(p => p.Options)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null) return NotFound();

        product.Name = dto.Name;
        product.Description = dto.Description;
        product.BasePrice = dto.BasePrice;
        product.IsActive = dto.IsActive;

        product.Options!.Clear();
        foreach (var o in dto.Options)
        {
            product.Options.Add(new ProductOption
            {
                OptionName = o.OptionName,
                OptionValue = o.OptionValue,
                PriceModifier = o.PriceModifier
            });
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeactivateProduct(int id)
    {
        var product = await _context.Products.FindAsync(id);
        if (product == null) return NotFound();

        product.IsActive = false;
        await _context.SaveChangesAsync();
        return NoContent();
    }
}