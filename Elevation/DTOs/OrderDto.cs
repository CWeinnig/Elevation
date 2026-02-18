namespace Elevation.DTOs;

public class CreateOrderDto
{
    public int UserId { get; set; }
    public string SquarePaymentId { get; set; } = string.Empty;
    public List<CreateOrderItemDto> Items { get; set; } = new();
    public List<int> FileIds { get; set; } = new();
}

public class CreateOrderItemDto
{
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public List<CreateOrderOptionDto> Options { get; set; } = new();
}

public class CreateOrderOptionDto
{
    public int ProductOptionId { get; set; }
}

public class UpdateOrderStatusDto
{
    public string NewStatus { get; set; } = string.Empty;
}

public class OrderDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal TotalPrice { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();
    public List<UploadedFileDto> UploadedFiles { get; set; } = new();
}

public class OrderItemDto
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public List<OrderOptionDto> Options { get; set; } = new();
}

public class OrderOptionDto
{
    public string OptionName { get; set; } = string.Empty;
    public string OptionValue { get; set; } = string.Empty;
    public decimal PriceModifier { get; set; }
}