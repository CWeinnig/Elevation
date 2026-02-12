using System.Text.Json.Serialization;

namespace Elevation.Models;
public class ProductOption
{
    public int Id { get; set; }

    public int ProductId { get; set; }
    [JsonIgnore]
    public Product? Product { get; set; }

    public string Name { get; set; }
    public decimal PriceModifier { get; set; }
}
