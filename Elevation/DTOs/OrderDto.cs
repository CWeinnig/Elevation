namespace Elevation.DTOs;

using System;
using System.Collections.Generic;

public class CreateOrderDto
{
    public int UserId { get; set; }
    public string GuestEmail { get; set; } = string.Empty;
    public string SquarePaymentId { get; set; } = string.Empty;
    public string DesignNotes { get; set; } = string.Empty;
    public bool IsQuoteRequest { get; set; } = false;
    public string CustomerPhone { get; set; } = string.Empty;
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

public class OrderDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string GuestEmail { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal TotalPrice { get; set; }
    public DateTime CreatedAt { get; set; }
    public string DesignNotes { get; set; } = string.Empty;
    public bool IsQuoteRequest { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string ProofComments { get; set; } = string.Empty;
    // PaymentToken intentionally excluded from standard responses
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
    public bool IsTiered { get; set; }
    public List<OrderOptionDto> Options { get; set; } = new();
}

public class OrderOptionDto
{
    public string OptionName { get; set; } = string.Empty;
    public string OptionValue { get; set; } = string.Empty;
    public decimal PriceModifier { get; set; }
}

public class UpdateOrderStatusDto
{
    public string NewStatus { get; set; } = string.Empty;
}

public class UploadProofDto
{
    public string AdminNotes { get; set; } = string.Empty;
}