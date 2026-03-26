using System.Text.Json.Serialization;

namespace Elevation.Models;

public class Order
{
    public int Id { get; set; }
    public int? UserId { get; set; }

    [JsonIgnore]
    public User? User { get; set; }

    public string GuestEmail { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public decimal TotalPrice { get; set; }
    public string SquarePaymentId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public string DesignNotes { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;

    public bool IsQuoteRequest { get; set; } = false;
    public string PaymentToken { get; set; } = string.Empty;
    public string ProofComments { get; set; } = string.Empty;

    public string ShipToName { get; set; } = string.Empty;
    public string ShipToStreet { get; set; } = string.Empty;
    public string ShipToCity { get; set; } = string.Empty;
    public string ShipToState { get; set; } = string.Empty;
    public string ShipToZip { get; set; } = string.Empty;

   
    public decimal ShippingCost { get; set; } = 0m;

    public string ShippingCarrier { get; set; } = string.Empty;
    public string TrackingNumber { get; set; } = string.Empty;
    public DateTime? EstimatedDelivery { get; set; }

    public ICollection<OrderItem>? Items { get; set; }
    public ICollection<UploadedFile>? UploadedFiles { get; set; }
    public ICollection<Notification>? Notifications { get; set; }
}