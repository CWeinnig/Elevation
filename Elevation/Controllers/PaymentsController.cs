using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly HttpClient _http;

    public PaymentsController(IConfiguration config, IHttpClientFactory httpFactory)
    {
        _config = config;
        _http = httpFactory.CreateClient("Square");
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
        var baseUrl = isSandbox
            ? "https://connect.squareupsandbox.com"
            : "https://connect.squareup.com";

        var payload = new
        {
            source_id = dto.SourceId,
            idempotency_key = Guid.NewGuid().ToString(),
            amount_money = new { amount = dto.AmountCents, currency = "USD" },
            note = "D & J's Elevated Designs Order"
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v2/payments")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"
            )
        };

        request.Headers.Add("Authorization", $"Bearer {accessToken}");
        request.Headers.Add("Square-Version", "2025-01-23");

        var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            using var errDoc = JsonDocument.Parse(body);
            var errors = errDoc.RootElement
                .GetProperty("errors")
                .EnumerateArray()
                .Select(e => e.GetProperty("detail").GetString())
                .ToArray();
            return BadRequest(new { errors });
        }

        using var doc = JsonDocument.Parse(body);
        var payment = doc.RootElement.GetProperty("payment");
        var paymentId = payment.GetProperty("id").GetString();
        var status = payment.GetProperty("status").GetString();

        if (status != "COMPLETED")
            return BadRequest(new { errors = new[] { $"Payment not completed. Status: {status}" } });

        return Ok(new { paymentId, status, amountCents = dto.AmountCents });
    }
}

public class ProcessPaymentDto
{
    public string SourceId { get; set; } = string.Empty;
    public int AmountCents { get; set; }
}