using System.Net;
using System.Net.Mail;
using System.Text;

namespace Elevation.Services;

public interface IEmailService
{
    Task SendOrderConfirmedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items, decimal shippingCost = 0m);
    Task SendQuoteReceivedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items, string designNotes);
    Task SendProofReadyAsync(string toEmail, int orderId, string proofDownloadUrl, string approveUrl);
    Task SendAdminRevisionRequestedAsync(string adminEmail, int orderId, string customerEmail, string comments);
    Task SendAdminCancellationRequestedAsync(string adminEmail, int orderId, string customerEmail, string comments);
    Task SendOrderCompletedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem>? items = null, decimal shippingCost = 0m);
    Task SendPaymentLinkAsync(string toEmail, int orderId, decimal total, string paymentUrl, List<EmailLineItem>? items = null, decimal shippingCost = 0m);
    Task SendEmailConfirmationAsync(string toEmail, string name, string confirmUrl);
    Task SendOrderShippedAsync(string toEmail, int orderId, string carrier, string trackingNumber, DateTime? estimatedDelivery);
}

public class EmailLineItem
{
    public string ProductName { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public bool IsTiered { get; set; }
    public List<EmailLineItemOption> Options { get; set; } = new();
}

public class EmailLineItemOption
{
    public string OptionValue { get; set; } = string.Empty;
    public decimal PriceModifier { get; set; }
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

    public Task SendOrderConfirmedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem> items, decimal shippingCost = 0m)
    {
        var subject = $"Order Confirmed – D & J's Elevated Designs";
        var body = BuildBase(
            heading: "Your order is confirmed! 🎉",
            intro: "Thanks for your order. We've received your payment and will begin production soon.",
            orderId: orderId,
            items: items,
            total: total,
            shippingCost: shippingCost,
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
            shippingCost: 0m,
            extra: notesHtml
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendProofReadyAsync(string toEmail, int orderId, string proofDownloadUrl, string approveUrl)
    {
        var subject = "Your proof is ready for review – D & J's Elevated Designs";
        var body = BuildProofReady(orderId, proofDownloadUrl, approveUrl);
        return SendAsync(toEmail, subject, body);
    }

    public Task SendAdminRevisionRequestedAsync(string adminEmail, int orderId, string customerEmail, string comments)
    {
        var subject = $"Revision Requested – Quote #{orderId}";
        var body = BuildSimple(
            heading: $"A customer has requested changes on Quote #{orderId} ✏️",
            paragraphs: new[]
            {
                $"Customer: <strong>{WebUtility.HtmlEncode(customerEmail)}</strong>",
                "Their feedback:<br><blockquote style='margin:8px 0;padding:10px 14px;background:#f3f0ff;border-left:4px solid #7c3aed;border-radius:4px;color:#374151;'>" + WebUtility.HtmlEncode(comments) + "</blockquote>",
                "Please review their comments, make the necessary changes, and upload a revised proof."
            },
            ctaText: null,
            ctaUrl: null
        );
        return SendAsync(adminEmail, subject, body);
    }

    public Task SendAdminCancellationRequestedAsync(string adminEmail, int orderId, string customerEmail, string comments)
    {
        var subject = $"Cancellation Requested – Quote #{orderId}";
        var body = BuildSimple(
            heading: $"A customer has requested to cancel Quote #{orderId} ✗",
            paragraphs: new[]
            {
                $"Customer: <strong>{WebUtility.HtmlEncode(customerEmail)}</strong>",
                string.IsNullOrWhiteSpace(comments)
                    ? "No reason was provided."
                    : "Their reason:<br><blockquote style='margin:8px 0;padding:10px 14px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;color:#374151;'>" + WebUtility.HtmlEncode(comments) + "</blockquote>",
                "No action has been taken automatically. Please review and update the order status as appropriate."
            },
            ctaText: null,
            ctaUrl: null
        );
        return SendAsync(adminEmail, subject, body);
    }

    public Task SendOrderCompletedAsync(string toEmail, int orderId, decimal total, List<EmailLineItem>? items = null, decimal shippingCost = 0m)
    {
        var subject = $"Order is Complete – D & J's Elevated Designs";
        if (items != null && items.Count > 0)
        {
            var body = BuildBase(
                heading: "Your order is complete! 📦",
                intro: "Great news — your order is finished and ready. Thank you for choosing D & J's Elevated Designs!",
                orderId: orderId,
                items: items,
                total: total,
                shippingCost: shippingCost,
                extra: null
            );
            return SendAsync(toEmail, subject, body);
        }
        var simpleBody = BuildSimple(
            heading: "Your order is complete! 📦",
            paragraphs: new[]
            {
                "Great news — your order is finished and ready. Thank you for choosing D & J's Elevated Designs!",
                "If you have any questions about your order, feel free to reply to this email or contact us directly."
            },
            ctaText: null,
            ctaUrl: null
        );
        return SendAsync(toEmail, subject, simpleBody);
    }

    public Task SendPaymentLinkAsync(string toEmail, int orderId, decimal total, string paymentUrl, List<EmailLineItem>? items = null, decimal shippingCost = 0m)
    {
        var subject = $"Complete Your Payment for Your Quote – D & J's Elevated Designs";
        if (items != null && items.Count > 0)
        {
            var body = BuildBase(
                heading: "Proof approved — complete your payment to start production! 💳",
                intro: $"You've approved the proof for your quote. Click the button below to securely complete your payment of <strong>${total:F2}</strong>.",
                orderId: orderId,
                items: items,
                total: total,
                shippingCost: shippingCost,
                extra: $@"<tr><td style=""padding:0 0 16px 0;""><a href=""{WebUtility.HtmlEncode(paymentUrl)}"" style=""display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;"">Complete Payment</a></td></tr>"
            );
            return SendAsync(toEmail, subject, body);
        }
        var simpleBody = BuildSimple(
            heading: "Proof approved — complete your payment to start production! 💳",
            paragraphs: new[]
            {
                $"You've approved the proof for your quote. Click the button below to securely complete your payment of <strong>${total:F2}</strong>.",
                "Once payment is received, we'll begin production on your order right away."
            },
            ctaText: "Complete Payment",
            ctaUrl: paymentUrl
        );
        return SendAsync(toEmail, subject, simpleBody);
    }

    public Task SendEmailConfirmationAsync(string toEmail, string name, string confirmUrl)
    {
        var subject = "Confirm your email – D & J's Elevated Designs";
        var body = BuildSimple(
            heading: "Confirm your email address ✉️",
            paragraphs: new[]
            {
                $"Hi {WebUtility.HtmlEncode(name)}, thanks for creating an account! Click the button below to verify your email address and activate your account.",
                "This link will expire after 24 hours. If you didn't create an account, you can safely ignore this email."
            },
            ctaText: "Confirm Email",
            ctaUrl: confirmUrl
        );
        return SendAsync(toEmail, subject, body);
    }

    public Task SendOrderShippedAsync(string toEmail, int orderId, string carrier, string trackingNumber, DateTime? estimatedDelivery)
    {
        var subject = "Your order has shipped! – D & J's Elevated Designs";

        var carrierLower = carrier.ToLower();
        var trackingUrl = carrierLower.Contains("fedex")
            ? $"https://www.fedex.com/fedextrack/?trknbr={Uri.EscapeDataString(trackingNumber)}"
            : carrierLower.Contains("ups")
                ? $"https://www.ups.com/track?tracknum={Uri.EscapeDataString(trackingNumber)}"
                : $"https://tools.usps.com/go/TrackConfirmAction?tLabels={Uri.EscapeDataString(trackingNumber)}";

        var deliveryPara = estimatedDelivery.HasValue
            ? $"Estimated delivery: <strong>{estimatedDelivery.Value:MMMM d, yyyy}</strong>"
            : "Check the tracking link for the latest delivery estimate.";

        var body = BuildSimple(
            heading: "Your order is on its way! 🚚",
            paragraphs: new[]
            {
                $"Great news — your order has shipped via <strong>{WebUtility.HtmlEncode(carrier)}</strong>.",
                $"Tracking number: <strong>{WebUtility.HtmlEncode(trackingNumber)}</strong>",
                deliveryPara
            },
            ctaText: "Track Your Package",
            ctaUrl: trackingUrl
        );
        return SendAsync(toEmail, subject, body);
    }

    // ── Email builders ────────────────────────────────────────────────────────

    private string BuildProofReady(int orderId, string proofUrl, string approveUrl) => Wrap($@"
        <tr><td style=""padding:0 0 16px 0;""><h2 style=""margin:0;font-size:22px;font-weight:700;color:#111827;"">Your proof is ready for review! 👀</h2></td></tr>
        <tr><td style=""padding:0 0 16px 0;""><p style=""margin:0;font-size:15px;color:#6b7280;line-height:1.6;"">We've prepared a proof for your order. Please download and review it carefully before approving.</p></td></tr>
        <tr><td style=""padding:0 0 24px 0;"">
            <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                <tr>
                    <td style=""padding-right:6px;"" width=""50%"">
                        <a href=""{WebUtility.HtmlEncode(proofUrl)}"" style=""display:block;text-align:center;padding:13px 0;background:#f3f4f6;color:#374151;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;border:1.5px solid #e5e7eb;"">📄 View Proof</a>
                    </td>
                    <td style=""padding-left:6px;"" width=""50%"">
                        <a href=""{WebUtility.HtmlEncode(approveUrl)}"" style=""display:block;text-align:center;padding:13px 0;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;"">✓ Approve Proof</a>
                    </td>
                </tr>
            </table>
        </td></tr>
        <tr><td><p style=""margin:0;font-size:13px;color:#9ca3af;line-height:1.5;"">Approving confirms the proof looks correct and authorizes us to proceed to payment. To request changes or cancel, please log into your account or reply to this email.</p></td></tr>");

    private string BuildBase(string heading, string intro, int orderId, List<EmailLineItem> items, decimal total, decimal shippingCost, string? extra)
    {
        var rows = new StringBuilder();
        foreach (var item in items)
        {
            var label = WebUtility.HtmlEncode(item.DisplayName ?? item.ProductName);
            var lineTotal = item.IsTiered ? item.UnitPrice : item.UnitPrice * item.Quantity;
            var qtyCell = item.IsTiered ? $"qty {item.Quantity}" : $"{item.Quantity} x ${item.UnitPrice:F2}";
            rows.Append($@"
                <tr>
                    <td style=""padding:8px 0 2px 0;font-size:14px;color:#374151;font-weight:600;"">{label}</td>
                    <td style=""padding:8px 0 2px 0;font-size:13px;color:#6b7280;text-align:center;"">{qtyCell}</td>
                    <td style=""padding:8px 0 2px 0;font-size:14px;color:#374151;font-weight:600;text-align:right;"">${lineTotal:F2}</td>
                </tr>");
            foreach (var opt in item.Options.Where(o => o.PriceModifier != 0))
            {
                rows.Append($@"
                <tr>
                    <td colspan=""2"" style=""padding:1px 0 4px 12px;font-size:12px;color:#9ca3af;"">+ {WebUtility.HtmlEncode(opt.OptionValue)}</td>
                    <td style=""padding:1px 0 4px 0;font-size:12px;color:#7c3aed;text-align:right;"">+${opt.PriceModifier:F2} each</td>
                </tr>");
            }
            rows.Append(@"<tr><td colspan=""3"" style=""padding:0;border-bottom:1px solid #e5e7eb;""></td></tr>");
        }

        // Shipping row (only shown when shippingCost > 0)
        var shippingRow = shippingCost > 0 ? $@"
                        <tr>
                            <td colspan=""2"" style=""padding:8px 0 0 0;font-size:13px;color:#6b7280;"">Shipping</td>
                            <td style=""padding:8px 0 0 0;font-size:13px;color:#374151;text-align:right;"">${shippingCost:F2}</td>
                        </tr>" : "";

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
                        {shippingRow}
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