namespace Elevation.Models;
public class Notification
{
    public int Id { get; set; }

    public int OrderId { get; set; }
    public Order Order { get; set; }

    public string Type { get; set; } // email, sms, etc
    public string Recipient { get; set; }

    public DateTime SentAt { get; set; }
}
