using System.Text.Json.Serialization;

namespace Elevation.Models;

public class PriceTier
{
    public int Id { get; set; }

    public int ProductId { get; set; }
    [JsonIgnore]
    public Product? Product { get; set; }

    public int MinQty { get; set; }

    public decimal Price { get; set; }

    public string Label { get; set; } = string.Empty;
}