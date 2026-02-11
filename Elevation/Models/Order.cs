namespace Elevation.Models;
public class Order
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; }

    public string Status { get; set; }
    public decimal TotalPrice { get; set; }

    public string SquarePaymentId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrderItem> Items { get; set; }
    public ICollection<UploadedFile> UploadedFiles { get; set; }
    public ICollection<Notification> Notifications { get; set; }
}
