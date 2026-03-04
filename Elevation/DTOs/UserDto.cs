namespace Elevation.DTOs;

public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class RegisterDto
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class UpdateUserDto
{
    /// <summary>Always required to confirm identity.</summary>
    public string CurrentPassword { get; set; } = string.Empty;
    /// <summary>Leave empty to keep existing email.</summary>
    public string? NewEmail { get; set; }
    /// <summary>Leave empty to keep existing password.</summary>
    public string? NewPassword { get; set; }
}