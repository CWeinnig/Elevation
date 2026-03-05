using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;

    public AdminController(AppDbContext context, IConfiguration config)
    {
        _context = context;
        _config = config;
    }

    // POST api/admin/login
    // Credentials are read from appsettings.json: Admin:Username / Admin:Password
    [AllowAnonymous]
    [HttpPost("login")]
    public IActionResult Login([FromBody] AdminLoginRequest req)
    {
        var expectedUser = _config["Admin:Username"];
        var expectedPass = _config["Admin:Password"];

        if (string.IsNullOrEmpty(expectedUser) || string.IsNullOrEmpty(expectedPass))
            return StatusCode(500, new { message = "Admin credentials are not configured on the server." });

        if (req.Username != expectedUser || req.Password != expectedPass)
            return Unauthorized(new { message = "Invalid credentials." });

        // Static token is sufficient for a small internal admin panel.
        // Replace with JWT if you need expiry / multi-admin support later.
        var token = _config["Admin:Token"] ?? "admin-token-djed";
        return Ok(new { success = true, token });
    }

    // GET api/admin/products  � kept for potential future admin-only reporting.
    // The frontend now uses GET /api/Products for the admin list so options are always included.
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
}

public class AdminLoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}