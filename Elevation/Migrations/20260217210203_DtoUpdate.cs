using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Elevation.Migrations
{
    /// <inheritdoc />
    public partial class DtoUpdate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Name",
                table: "ProductOptions",
                newName: "OptionValue");

            migrationBuilder.AddColumn<string>(
                name: "OptionName",
                table: "ProductOptions",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OptionName",
                table: "ProductOptions");

            migrationBuilder.RenameColumn(
                name: "OptionValue",
                table: "ProductOptions",
                newName: "Name");
        }
    }
}
