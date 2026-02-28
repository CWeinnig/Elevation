using Microsoft.AspNetCore.Mvc;
using Square;
using Square.Authentication;
using Square.Models;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly IConfiguration _config;

    public PaymentsController(IConfiguration config)
    {
        _config = config;
    }

    [HttpPost("process")]
    public async Task<IActionResult> ProcessPayment([FromBody] ProcessPaymentDto dto)
    {
        if (string.IsNullOrEmpty(dto.SourceId))
            return BadRequest("Missing payment source.");

        if (dto.AmountCents <= 0)
            return BadRequest("Invalid payment amount.");

        var accessToken = _config["Square:AccessToken"] ?? string.Empty;
        var isSandbox = _config["Square:Environment"] == "sandbox";

        var client = new SquareClient.Builder()
            .BearerAuthCredentials(
                new BearerAuthModel.Builder(accessToken).Build()
            )
            .Environment(isSandbox ? Square.Environment.Sandbox : Square.Environment.Production)
            .Build();

        var amountMoney = new Money.Builder()
            .Amount((long)dto.AmountCents)
            .Currency("USD")
            .Build();

        var body = new CreatePaymentRequest.Builder(
                sourceId: dto.SourceId,
                idempotencyKey: Guid.NewGuid().ToString()
            )
            .AmountMoney(amountMoney)
            .Note("D & J's Elevated Designs Order")
            .Build();

        try
        {
            var response = await client.PaymentsApi.CreatePaymentAsync(body);
            var payment = response.Payment;

            if (payment.Status != "COMPLETED")
                return BadRequest(new { errors = new[] { $"Payment not completed. Status: {payment.Status}" } });

            return Ok(new
            {
                paymentId = payment.Id,
                status = payment.Status,
                amountCents = payment.AmountMoney?.Amount
            });
        }
        catch (Square.Exceptions.ApiException e)
        {
            var errors = e.Errors?.Select(err => err.Detail).ToArray()
                         ?? new[] { "Payment failed." };
            return BadRequest(new { errors });
        }
    }
}

public class ProcessPaymentDto
{
    public string SourceId { get; set; } = string.Empty;
    public int AmountCents { get; set; }
}