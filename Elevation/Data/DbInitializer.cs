using Elevation.Models;

namespace Elevation.Data;

public static class DbInitializer
{
    public static void Initialize(AppDbContext context)
    {
        // 1. Check if DB exists
        context.Database.EnsureCreated();

        // 2. Look for any products.
        if (context.Products.Any())
        {
            return;   // DB has been seeded
        }

        // 3. Add seed data
        var products = new Product[]
        {
            new Product{Name="Business Cards", Description="Standard 14pt", BasePrice=15.00m, IsActive=true},
            new Product{Name="Vinyl Banner", Description="Outdoor durable", BasePrice=50.00m, IsActive=true},
            new Product{Name="Flyers", Description="Glossy 100lb paper", BasePrice=0.25m, IsActive=true}
        };

        context.Products.AddRange(products);
        context.SaveChanges();

        // Add a default user so you can login/order
        var user = new User
        {
            Name = "Test Admin",
            Email = "admin@example.com",
            PasswordHash = "password123",
            Role = "Admin",
            CreatedAt = DateTime.UtcNow
        };

        context.Users.Add(user);
        context.SaveChanges();
    }
}