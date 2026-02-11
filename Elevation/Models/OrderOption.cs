namespace Elevation.Models;
public class OrderOption
{
    public int Id { get; set; }

    public int OrderItemId { get; set; }
    public OrderItem OrderItem { get; set; }

    public string OptionName { get; set; }
    public string OptionValue { get; set; }
    public decimal PriceModifier { get; set; }
}
