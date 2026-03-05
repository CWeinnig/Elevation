using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;      
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;
using BCrypt.Net;

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

    [HttpPost("register")]
    public async Task<ActionResult<UserDto>> Register(RegisterDto dto)
    {
        if (await _context.Users.AnyAsync(u => u.Email == dto.Email))
            return Conflict("Email is already registered.");

        var user = new User
        {
            Name = dto.Name,
            Email = dto.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = "Customer",
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, MapToDto(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<UserDto>> Login([FromBody] LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("Invalid email or password.");

    var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Name),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Role, user.Role)
    };

    var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);

    await HttpContext.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal,
        new AuthenticationProperties
        {
            IsPersistent = true,
            ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
        }
    );

        return Ok(MapToDto(user));
    }
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
    if (!User.Identity?.IsAuthenticated ?? true)
        return Unauthorized();

    var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (userId == null)
        return Unauthorized();

    var user = await _context.Users.FindAsync(int.Parse(userId));
    if (user == null)
        return NotFound();

    return Ok(MapToDto(user));
    
    }
   
    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
    await HttpContext.SignOutAsync(
        CookieAuthenticationDefaults.AuthenticationScheme
    );

    return Ok(new { message = "Logged out successfully." });
    }
   
    [Authorize(Roles = "Admin")]
    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();
        return MapToDto(user);
    }

    // PUT /api/Users/{id}
    // Requires current password to confirm identity before any change.
    [Authorize]
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();

        var claimId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (claimId == null) return Unauthorized();

        var currentUserId = int.Parse(claimId);

        if (currentUserId != id && !User.IsInRole("Admin"))
            return Forbid();

        // Always require current password
        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            return Unauthorized("Current password is incorrect.");

        if (!string.IsNullOrWhiteSpace(dto.NewEmail) && dto.NewEmail != user.Email)
        {
            if (await _context.Users.AnyAsync(u => u.Email == dto.NewEmail && u.Id != id))
                return Conflict("That email is already in use.");
            user.Email = dto.NewEmail.Trim();
        }

        if (!string.IsNullOrWhiteSpace(dto.NewPassword))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);

        await _context.SaveChangesAsync();
        return Ok(MapToDto(user));
    }

    private static UserDto MapToDto(User user) => new UserDto
    {
        Id = user.Id,
        Name = user.Name,
        Email = user.Email,
        Role = user.Role,
        CreatedAt = user.CreatedAt
    };
}

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}