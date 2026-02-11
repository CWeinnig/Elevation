namespace Elevation.Models;
public class ProductOption
{
    public int Id { get; set; }

    public int ProductId { get; set; }
    public Product Product { get; set; }

    public string Name { get; set; }
    public decimal PriceModifier { get; set; }
}
