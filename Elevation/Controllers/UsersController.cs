using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _context;

    public UsersController(AppDbContext context)
    {
        _context = context;
    }

    // POST: api/Users/register
    [HttpPost("register")]
    public async Task<ActionResult<User>> Register(User user)
    {
        if (await _context.Users.AnyAsync(u => u.Email == user.Email))
        {
            return Conflict("Email is already registered.");
        }

        // Set defaults
        user.CreatedAt = DateTime.UtcNow;
        if (string.IsNullOrEmpty(user.Role)) user.Role = "Customer";

        // Add to DB
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, user);
    }

    // POST: api/Users/login
    [HttpPost("login")]
    public async Task<ActionResult<User>> Login([FromBody] LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.PasswordHash == request.Password);

        if (user == null)
        {
            return Unauthorized("Invalid email or password.");
        }

        return Ok(user);
    }

    // GET: api/Users/5
    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetUser(int id)
    {
        var user = await _context.Users
            .Include(u => u.Orders)
            .FirstOrDefaultAsync(u => u.Id == id);

        if (user == null) return NotFound();
        return user;
    }
}

// Simple DTO for Login so we don't need a full User object
public class LoginRequest
{
    public string Email { get; set; }
    public string Password { get; set; }
}