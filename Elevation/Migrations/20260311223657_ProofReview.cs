using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Elevation.Migrations
{
    /// <inheritdoc />
    public partial class ProofReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProofComments",
                table: "Orders",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProofComments",
                table: "Orders");
        }
    }
}
