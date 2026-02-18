namespace Elevation.DTOs;


/// Used if the frontend ever needs to display notification history

public class NotificationDto
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
}