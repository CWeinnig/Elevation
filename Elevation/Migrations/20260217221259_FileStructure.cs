using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Elevation.Migrations
{
    /// <inheritdoc />
    public partial class FileStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UploadedFiles_Orders_OrderId",
                table: "UploadedFiles");

            migrationBuilder.AlterColumn<int>(
                name: "OrderId",
                table: "UploadedFiles",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddForeignKey(
                name: "FK_UploadedFiles_Orders_OrderId",
                table: "UploadedFiles",
                column: "OrderId",
                principalTable: "Orders",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UploadedFiles_Orders_OrderId",
                table: "UploadedFiles");

            migrationBuilder.AlterColumn<int>(
                name: "OrderId",
                table: "UploadedFiles",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_UploadedFiles_Orders_OrderId",
                table: "UploadedFiles",
                column: "OrderId",
                principalTable: "Orders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
