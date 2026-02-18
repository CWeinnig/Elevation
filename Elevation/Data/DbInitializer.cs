using Elevation.Models;

namespace Elevation.Data;

public static class DbInitializer
{
    public static void Initialize(AppDbContext context)
    {


        if (context.Products.Any())
        {
            return;   // DB has been seeded
        }

        var products = new Product[]
        {
            new Product{Name="Business Cards", Description="Standard 14pt", BasePrice=15.00m, IsActive=true},
            new Product{Name="Vinyl Banner", Description="Outdoor durable", BasePrice=50.00m, IsActive=true},
            new Product{Name="Flyers", Description="Glossy 100lb paper", BasePrice=0.25m, IsActive=true}
        };

        context.Products.AddRange(products);
        context.SaveChanges();

        context.Users.AddRange(
            new User { Name = "Test Admin", Email = "admin@example.com", PasswordHash = "password123", Role = "Admin", CreatedAt = DateTime.UtcNow },
            new User { Name = "Test Customer", Email = "customer@example.com", PasswordHash = "password123", Role = "Customer", CreatedAt = DateTime.UtcNow }
        );
        context.SaveChanges();


        var options = new ProductOption[]
        {
            new ProductOption { ProductId = products[0].Id, OptionName = "Size", OptionValue = "Standard 3.5x2", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[0].Id, OptionName = "Size", OptionValue = "Large 4x3", PriceModifier = 2.00m },
            new ProductOption { ProductId = products[0].Id, OptionName = "Finish", OptionValue = "Matte", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[0].Id, OptionName = "Finish", OptionValue = "Glossy", PriceModifier = 3.00m },

            new ProductOption { ProductId = products[1].Id, OptionName = "Size", OptionValue = "2ft x 4ft", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[1].Id, OptionName = "Size", OptionValue = "4ft x 8ft", PriceModifier = 25.00m },
            new ProductOption { ProductId = products[1].Id, OptionName = "Sides", OptionValue = "Single Sided", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[1].Id, OptionName = "Sides", OptionValue = "Double Sided", PriceModifier = 15.00m },

            new ProductOption { ProductId = products[2].Id, OptionName = "Size", OptionValue = "Half Page", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[2].Id, OptionName = "Size", OptionValue = "Full Page", PriceModifier = 0.10m },
            new ProductOption { ProductId = products[2].Id, OptionName = "Finish", OptionValue = "Standard", PriceModifier = 0.00m },
            new ProductOption { ProductId = products[2].Id, OptionName = "Finish", OptionValue = "Premium Glossy", PriceModifier = 0.05m },
        };
        context.ProductOptions.AddRange(options);
        context.SaveChanges();

    }
}