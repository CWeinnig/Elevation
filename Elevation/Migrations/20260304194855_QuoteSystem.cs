using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Elevation.Migrations
{
    /// <inheritdoc />
    public partial class QuoteSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DesignNotes",
                table: "Orders",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsQuoteRequest",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PaymentToken",
                table: "Orders",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DesignNotes",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsQuoteRequest",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PaymentToken",
                table: "Orders");
        }
    }
}
