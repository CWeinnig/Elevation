using System.Text.Json.Serialization;

namespace Elevation.Models;
public class Product
{
    public int Id { get; set; }

    public string Name { get; set; }
    public string Description { get; set; }
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; }
    [JsonIgnore]
    public ICollection<ProductOption>? Options { get; set; }
}
