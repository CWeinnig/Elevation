namespace Elevation.DTOs;


public class ProductDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BasePrice { get; set; }
    public List<ProductOptionDto> Options { get; set; } = new();
}


public class ProductOptionDto
{
    public int Id { get; set; }
    public string OptionName { get; set; } = string.Empty;
    public string OptionValue { get; set; } = string.Empty;
    public decimal PriceModifier { get; set; }
}


public class CreateProductDto
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BasePrice { get; set; }

    public List<CreateProductOptionDto> Options { get; set; } = new();
}


public class UpdateProductDto
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; }
    public List<CreateProductOptionDto> Options { get; set; } = new();
}


public class CreateProductOptionDto
{
    public string OptionName { get; set; } = string.Empty;
    public string OptionValue { get; set; } = string.Empty;
    public decimal PriceModifier { get; set; }
}