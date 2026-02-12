using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;

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

    // GET: api/Products
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
    {
        // Only show active products to customers
        return await _context.Products
            .Include(p => p.Options)
            .Where(p => p.IsActive)
            .ToListAsync();
    }

    // GET: api/Products/5
    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(int id)
    {
        var product = await _context.Products
            .Include(p => p.Options)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null) return NotFound();
        return product;
    }

    // POST: api/Products (Admin only)
    [HttpPost]
    public async Task<ActionResult<Product>> PostProduct(Product product)
    {
        // Ensure options are initialized to prevent null errors
        if (product.Options == null) product.Options = new List<ProductOption>();

        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
    }

    // PUT: api/Products/5 (Update price/options)
    [HttpPut("{id}")]
    public async Task<IActionResult> PutProduct(int id, Product product)
    {
        if (id != product.Id) return BadRequest();

        _context.Entry(product).State = EntityState.Modified;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!_context.Products.Any(e => e.Id == id)) return NotFound();
            throw;
        }

        return NoContent();
    }

    // DELETE: api/Products/5 (Soft Delete)
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