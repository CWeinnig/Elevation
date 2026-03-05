using System.Net;
using System.Net.Mail;
using System.Text;

namespace Elevation.Services;

public interface IEmailService
{
    Task SendOrderConfirmedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items);
    Task SendQuoteReceivedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items, string designNotes);
    Task SendProofReadyAsync(string toEmail, int orderId, string proofDownloadUrl);
    Task SendOrderCompletedAsync(string toEmail, int orderId, decimal total);
    Task SendPaymentLinkAsync(string toEmail, int orderId, decimal total, string paymentUrl);
}

public class EmailLineItem
{
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}

public class SmtpEmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmtpEmailService> _logger;

    private string FromAddress => _config["Email:From"] ?? "noreply@djselevated.com";
    private string FromName => _config["Email:FromName"] ?? "D & J's Elevated Designs";
    private string SmtpHost => _config["Email:SmtpHost"] ?? "smtp.gmail.com";
    private int SmtpPort => int.TryParse(_config["Email:SmtpPort"], out var p) ? p : 587;
    private string SmtpUser => _config["Email:SmtpUser"] ?? string.Empty;
    private string SmtpPass => _config["Email:SmtpPass"] ?? string.Empty;

    public SmtpEmailService(IConfiguration config, ILogger<SmtpEmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    // ── Public send methods ───────────────────────────────────────────────────

    public Task SendOrderConfirmedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items)
    {
        var subject = $"Order Confirmed – D & J's Elevated Designs";
        var body = BuildBase(
            heading: "Your order is confirmed! 🎉",
            intro: $"Thanks for your order. We've received your payment and will begin production soon.",
            orderId: orderId,
            items: items,
            total: total,
            extra: null
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendQuoteReceivedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items, string designNotes)
    {
        var subject = $"Quote Received – D & J's Elevated Designs";
        var notesHtml = string.IsNullOrWhiteSpace(designNotes) ? "" : $@"
            <tr>
                <td style=""padding:0 0 20px 0;"">
                    <div style=""background:#f3f0ff;border-left:4px solid #7c3aed;padding:14px 16px;border-radius:6px;"">
                        <p style=""margin:0 0 6px 0;font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;"">Your Design Notes</p>
                        <p style=""margin:0;font-size:14px;color:#374151;line-height:1.6;"">{WebUtility.HtmlEncode(designNotes)}</p>
                    </div>
                </td>
            </tr>";
        var body = BuildBase(
            heading: "We received your quote request! ✏️",
            intro: "Thanks for reaching out! We're reviewing your request and will prepare a proof for you to review. No payment is required until you approve the proof.",
            orderId: orderId,
            items: items,
            total: total,
            extra: notesHtml
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendProofReadyAsync(string toEmail, int orderId, string proofDownloadUrl)
    {
        var subject = $"Your proof for your quote is ready – D & J's Elevated Designs";
        var body = BuildSimple(
            heading: "Your proof is ready for review! 👀",
            paragraphs: new[]
            {
                $"We've prepared a proof for your quote. Please review it carefully and let us know if you'd like any changes.",
                "Once you approve the proof, we'll send you a secure payment link to complete your order."
            },
            ctaText: "Review Your Proof",
            ctaUrl: proofDownloadUrl
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendOrderCompletedAsync(string toEmail, int orderId, decimal total)
    {
        var subject = $"Order is Complete – D & J's Elevated Designs";
        var body = BuildSimple(
            heading: "Your order is complete! 📦",
            paragraphs: new[]
            {
                $"Great news — Order is finished and ready. Thank you for choosing D & J's Elevated Designs!",
                "If you have any questions about your order, feel free to reply to this email or contact us directly."
            },
            ctaText: null,
            ctaUrl: null
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendPaymentLinkAsync(string toEmail, int orderId, decimal total, string paymentUrl)
    {
        var subject = $"Complete Your Payment for Your Quote – D & J's Elevated Designs";
        var body = BuildSimple(
            heading: "Proof approved — complete your payment to start production! 💳",
            paragraphs: new[]
            {
                $"You've approved the proof for your quote. Click the button below to securely complete your payment of <strong>${total:F2}</strong>.",
                "Once payment is received, we'll begin production on your order right away."
            },
            ctaText: "Complete Payment",
            ctaUrl: paymentUrl
        );
        return SendAsync(toEmail, subject, body);
    }

    // ── Email builders ────────────────────────────────────────────────────────

    private string BuildBase(string heading, string intro, int orderId, List<EmailLineItem> items, decimal total, string? extra)
    {
        var rows = new StringBuilder();
        foreach (var item in items)
        {
            rows.Append($@"
                <tr>
                    <td style=""padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"">{WebUtility.HtmlEncode(item.ProductName)}</td>
                    <td style=""padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;"">{item.Quantity}</td>
                    <td style=""padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;"">${(item.UnitPrice * item.Quantity):F2}</td>
                </tr>");
        }

        return Wrap($@"
            <tr><td style=""padding:0 0 16px 0;""><h2 style=""margin:0;font-size:22px;font-weight:700;color:#111827;"">{heading}</h2></td></tr>
            <tr><td style=""padding:0 0 20px 0;""><p style=""margin:0;font-size:15px;color:#6b7280;line-height:1.6;"">{intro}</p></td></tr>
            {extra ?? ""}
            <tr>
                <td style=""padding:0 0 20px 0;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                        <tr>
                            <th style=""padding:6px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:left;text-transform:uppercase;"">Item</th>
                            <th style=""padding:6px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;text-transform:uppercase;"">Qty</th>
                            <th style=""padding:6px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:right;text-transform:uppercase;"">Price</th>
                        </tr>
                        {rows}
                        <tr>
                            <td colspan=""2"" style=""padding:12px 0 0 0;font-size:15px;font-weight:700;color:#111827;"">Total</td>
                            <td style=""padding:12px 0 0 0;font-size:15px;font-weight:700;color:#7c3aed;text-align:right;"">${total:F2}</td>
                        </tr>
                    </table>
                </td>
            </tr>");
    }

    private string BuildSimple(string heading, string[] paragraphs, string? ctaText, string? ctaUrl)
    {
        var paraHtml = string.Join("\n", paragraphs.Select(p =>
            $@"<tr><td style=""padding:0 0 14px 0;""><p style=""margin:0;font-size:15px;color:#6b7280;line-height:1.6;"">{p}</p></td></tr>"));

        var ctaHtml = (ctaText != null && ctaUrl != null) ? $@"
            <tr>
                <td style=""padding:10px 0 0 0;text-align:center;"">
                    <a href=""{WebUtility.HtmlEncode(ctaUrl)}"" style=""display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;"">{WebUtility.HtmlEncode(ctaText)}</a>
                </td>
            </tr>" : "";

        return Wrap($@"
            <tr><td style=""padding:0 0 16px 0;""><h2 style=""margin:0;font-size:22px;font-weight:700;color:#111827;"">{heading}</h2></td></tr>
            {paraHtml}
            {ctaHtml}");
    }

    private static string Wrap(string content) => $@"<!DOCTYPE html>
<html lang=""en"">
<head><meta charset=""UTF-8""/><meta name=""viewport"" content=""width=device-width,initial-scale=1""/></head>
<body style=""margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"">
    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background:#f9fafb;padding:40px 20px;"">
        <tr><td align=""center"">
            <table width=""600"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:600px;width:100%;"">
                <!-- Header -->
                <tr>
                    <td style=""background:linear-gradient(135deg,#7c3aed,#06b6d4);padding:28px 32px;border-radius:12px 12px 0 0;"">
                        <h1 style=""margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;"">D &amp; J's Elevated Designs</h1>
                        <p style=""margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.8);"">Professional Printing &amp; Design Services</p>
                    </td>
                </tr>
                <!-- Body -->
                <tr>
                    <td style=""background:#ffffff;padding:32px;border-radius:0 0 12px 12px;"">
                        <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                            {content}
                            <!-- Footer -->
                            <tr><td style=""padding:24px 0 0 0;border-top:1px solid #e5e7eb;margin-top:24px;"">
                                <p style=""margin:0;font-size:13px;color:#9ca3af;text-align:center;"">Questions? Reply to this email or contact us at <a href=""mailto:digitizeyourideas@gmail.com"" style=""color:#7c3aed;"">digitizeyourideas@gmail.com</a></p>
                                <p style=""margin:6px 0 0 0;font-size:12px;color:#d1d5db;text-align:center;"">&copy; 2026 D &amp; J's Elevated Designs. All rights reserved.</p>
                            </td></tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>";

    // ── Core SMTP send ────────────────────────────────────────────────────────

    private async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        if (string.IsNullOrWhiteSpace(SmtpUser) || string.IsNullOrWhiteSpace(SmtpPass))
        {
            _logger.LogWarning("Email not sent — SMTP credentials not configured. To: {To}, Subject: {Subject}", toEmail, subject);
            return;
        }

        try
        {
            using var client = new SmtpClient(SmtpHost, SmtpPort)
            {
                EnableSsl = true,
                Credentials = new NetworkCredential(SmtpUser, SmtpPass),
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            using var message = new MailMessage
            {
                From = new MailAddress(FromAddress, FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };
            message.To.Add(toEmail);

            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent to {To}: {Subject}", toEmail, subject);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {To}: {Subject}", toEmail, subject);
            // Don't rethrow — email failure should never crash an order
        }
    }
}