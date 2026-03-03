using System.Text.Json.Serialization;

namespace Elevation.Models;
public class Product
{
    public int Id { get; set; }

    public string Name { get; set; }
    public string Description { get; set; }
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; }
    public decimal? MinPrice { get; set; }
    public decimal? MaxPrice { get; set; }
    [JsonIgnore]
    public ICollection<ProductOption>? Options { get; set; }
    public ICollection<PriceTier> PriceTiers { get; set; } = new List<PriceTier>();
}
