using Microsoft.AspNetCore.Mvc;
using Elevation.Models;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _env;

    public FilesController(AppDbContext context, IWebHostEnvironment env)
    {
        _context = context;
        _env = env;
    }

    // POST: api/Files/upload
    [HttpPost("upload")]
    public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int orderId)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file received.");

        // 1. Verify Order exists first
        var order = await _context.Orders.FindAsync(orderId);
        if (order == null) return BadRequest("Invalid Order ID.");

        // 2. Prepare Storage Path (wwwroot/uploads)
        // Ensure the folder exists
        var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsRoot)) Directory.CreateDirectory(uploadsRoot);

        // 3. Generate Safe Filename (UUID + Original Extension)
        var fileExtension = Path.GetExtension(file.FileName);
        var trustedFileName = $"{Guid.NewGuid()}{fileExtension}";
        var physicalPath = Path.Combine(uploadsRoot, trustedFileName);

        // 4. Write to Disk
        using (var stream = new FileStream(physicalPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // 5. Save Record to Database
        var uploadedFile = new UploadedFile
        {
            OrderId = orderId,
            OriginalFileName = file.FileName,
            StoredFileName = trustedFileName,
            FilePath = $"/uploads/{trustedFileName}", // Web-accessible path
            UploadedAt = DateTime.UtcNow
        };

        _context.UploadedFiles.Add(uploadedFile);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "File uploaded successfully",
            fileId = uploadedFile.Id,
            url = uploadedFile.FilePath
        });
    }
}