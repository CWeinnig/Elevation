using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;
using Elevation.Services;
using BCrypt.Net;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IEmailService _email;
    private readonly IConfiguration _config;

    public UsersController(AppDbContext context, IEmailService email, IConfiguration config)
    {
        _context = context;
        _email = email;
        _config = config;
    }

    private string SiteBaseUrl => _config["SiteBaseUrl"]
        ?? $"{Request.Scheme}://{Request.Host}";

    // ── Register ──────────────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<ActionResult<UserDto>> Register(RegisterDto dto)
    {
        if (await _context.Users.AnyAsync(u => u.Email == dto.Email))
            return Conflict("Email is already registered.");

        var confirmToken = Guid.NewGuid().ToString("N");

        var user = new User
        {
            Name = dto.Name,
            Email = dto.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = "Customer",
            EmailConfirmed = false,
            EmailConfirmToken = confirmToken,
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var confirmUrl = $"{SiteBaseUrl}/?confirmEmail={confirmToken}";
        await _email.SendEmailConfirmationAsync(user.Email, user.Name, confirmUrl);

        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, MapToDto(user));
    }

    // ── Confirm email ─────────────────────────────────────────────────────────

    [HttpGet("confirm-email")]
    public async Task<IActionResult> ConfirmEmail([FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return BadRequest("Missing confirmation token.");

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.EmailConfirmToken == token);

        if (user == null)
            return NotFound("Invalid or already-used confirmation token.");

        user.EmailConfirmed = true;
        user.EmailConfirmToken = null;
        await _context.SaveChangesAsync();

        return Ok(MapToDto(user));
    }

    // ── Resend confirmation ───────────────────────────────────────────────────

    [HttpPost("resend-confirmation")]
    public async Task<IActionResult> ResendConfirmation([FromBody] ResendConfirmationDto dto)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == dto.Email);

        if (user != null && !user.EmailConfirmed)
        {
            user.EmailConfirmToken = Guid.NewGuid().ToString("N");
            await _context.SaveChangesAsync();

            var confirmUrl = $"{SiteBaseUrl}/?confirmEmail={user.EmailConfirmToken}";
            await _email.SendEmailConfirmationAsync(user.Email, user.Name, confirmUrl);
        }

        return Ok(new { message = "If that email is registered and unconfirmed, a new link has been sent." });
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    [HttpPost("login")]
    public async Task<ActionResult<UserDto>> Login([FromBody] LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("Invalid email or password.");

        if (!user.EmailConfirmed && user.Role != "Admin")
            return StatusCode(403, new { code = "EMAIL_NOT_CONFIRMED", message = "Please confirm your email before signing in." });

        return Ok(MapToDto(user));
    }

    // ── Get by ID ─────────────────────────────────────────────────────────────

    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();
        return MapToDto(user);
    }

    // ── Update email / password ───────────────────────────────────────────────

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            return Unauthorized("Current password is incorrect.");

        if (!string.IsNullOrWhiteSpace(dto.NewEmail) && dto.NewEmail != user.Email)
        {
            if (await _context.Users.AnyAsync(u => u.Email == dto.NewEmail && u.Id != id))
                return Conflict("That email is already in use.");

            user.Email = dto.NewEmail.Trim();
            user.EmailConfirmed = false;
            user.EmailConfirmToken = Guid.NewGuid().ToString("N");

            var confirmUrl = $"{SiteBaseUrl}/?confirmEmail={user.EmailConfirmToken}";
            await _email.SendEmailConfirmationAsync(user.Email, user.Name, confirmUrl);
        }

        if (!string.IsNullOrWhiteSpace(dto.NewPassword))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);

        await _context.SaveChangesAsync();
        return Ok(MapToDto(user));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static UserDto MapToDto(User user) => new UserDto
    {
        Id = user.Id,
        Name = user.Name,
        Email = user.Email,
        Role = user.Role,
        EmailConfirmed = user.EmailConfirmed,
        CreatedAt = user.CreatedAt
    };
}

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class ResendConfirmationDto
{
    public string Email { get; set; } = string.Empty;
}