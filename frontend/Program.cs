var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/quotes", async (HttpContext context) =>
{
    using var reader = new StreamReader(context.Request.Body);
    var body = await reader.ReadToEndAsync();

    Console.WriteLine("=== NEW QUOTE RECEIVED ===");
    Console.WriteLine(body);
    Console.WriteLine("==========================");

    return Results.Ok(new { success = true, message = "Quote received!" });
});

app.Run();





