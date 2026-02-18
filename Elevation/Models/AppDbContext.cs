namespace Elevation.Models;
using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<ProductOption> ProductOptions { get; set; }
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderOption> OrderOptions { get; set; }
    public DbSet<UploadedFile> UploadedFiles { get; set; }
    public DbSet<Notification> Notifications { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();

        modelBuilder.Entity<Product>().Property(p => p.BasePrice).HasPrecision(18, 2);
        modelBuilder.Entity<ProductOption>().Property(p => p.PriceModifier).HasPrecision(18, 2);

        modelBuilder.Entity<Order>().Property(o => o.TotalPrice).HasPrecision(18, 2);
        modelBuilder.Entity<OrderItem>().Property(oi => oi.UnitPrice).HasPrecision(18, 2);
        modelBuilder.Entity<OrderOption>().Property(oo => oo.PriceModifier).HasPrecision(18, 2);

        base.OnModelCreating(modelBuilder);
    }

}
