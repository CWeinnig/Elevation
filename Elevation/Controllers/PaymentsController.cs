using Microsoft.AspNetCore.Mvc;
using Square;
using Square.Payments;
using System;
using System.Threading.Tasks;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly SquareClient _squareClient;

    public PaymentsController(IConfiguration config)
    {
        // 1. The Environment is now an enum passed into ClientOptions
        var baseUrl = config["Square:Environment"] == "sandbox"
            ? SquareEnvironment.Sandbox
            : SquareEnvironment.Production;

        var accessToken = config["Square:AccessToken"] ?? string.Empty;

        // 2. Builders are gone; instantiate the client directly
        _squareClient = new SquareClient(
            accessToken,
            new ClientOptions { BaseUrl = baseUrl }
        );
    }

    [HttpPost("process")]
    public async Task<IActionResult> ProcessPayment([FromBody] ProcessPaymentDto dto)
    {
        if (string.IsNullOrEmpty(dto.SourceId))
            return BadRequest(new { errors = new[] { "Missing payment source." } });

        if (dto.AmountCents <= 0)
            return BadRequest(new { errors = new[] { "Invalid payment amount." } });

        // 3. Use standard C# object initializers instead of Builders
        var request = new CreatePaymentRequest
        {
            SourceId = dto.SourceId,
            IdempotencyKey = Guid.NewGuid().ToString(),
            AmountMoney = new Money
            {
                Amount = (long)dto.AmountCents,
                Currency = Currency.Usd // 4. Currency is now a strongly-typed enum
            },
            Note = "D & J's Elevated Designs Order"
        };

        try
        {
            // 5. PaymentsApi was shortened to just Payments, and CreatePaymentAsync to CreateAsync
            var response = await _squareClient.Payments.CreateAsync(request);
            var payment = response.Payment;

            if (payment.Status != "COMPLETED")
            {
                return BadRequest(new { errors = new[] { $"Payment not completed. Status: {payment.Status}" } });
            }

            return Ok(new
            {
                paymentId = payment.Id,
                status = payment.Status,
                amountCents = dto.AmountCents
            });
        }
        catch (Exception ex)
        {
            // 6. Catch standard exceptions, which also clears your CS0168 error
            return BadRequest(new { errors = new[] { ex.Message } });
        }
    }
}

public class ProcessPaymentDto
{
    public string SourceId { get; set; } = string.Empty;
    public int AmountCents { get; set; }
}