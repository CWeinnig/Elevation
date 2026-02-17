using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _env;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".ai", ".eps", ".svg"
    };

    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public FilesController(AppDbContext context, IWebHostEnvironment env)
    {
        _context = context;
        _env = env;
    }

    // POST: api/Files/upload
    // orderId is optional — file can be uploaded before the order exists
    [HttpPost("upload")]
    public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int? orderId)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file received.");

        if (file.Length > MaxFileSizeBytes)
            return BadRequest("File exceeds the maximum allowed size of 50 MB.");

        var fileExtension = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(fileExtension))
            return BadRequest($"File type '{fileExtension}' is not allowed. " +
                              $"Accepted types: {string.Join(", ", AllowedExtensions)}");

        if (orderId.HasValue)
        {
            var orderExists = await _context.Orders.AnyAsync(o => o.Id == orderId.Value);
            if (!orderExists) return BadRequest("Invalid Order ID.");
        }

        var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsRoot)) Directory.CreateDirectory(uploadsRoot);

        var trustedFileName = $"{Guid.NewGuid()}{fileExtension}";
        var physicalPath = Path.Combine(uploadsRoot, trustedFileName);

        using (var stream = new FileStream(physicalPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var uploadedFile = new UploadedFile
        {
            OrderId = orderId,
            OriginalFileName = file.FileName,
            StoredFileName = trustedFileName,
            FilePath = $"/uploads/{trustedFileName}",
            UploadedAt = DateTime.UtcNow
        };

        _context.UploadedFiles.Add(uploadedFile);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "File uploaded successfully",
            fileId = uploadedFile.Id,
            downloadUrl = Url.Action(nameof(DownloadFile), "Files", new { id = uploadedFile.Id }, Request.Scheme)
        });
    }

    // GET: api/Files/order/{orderId}
    [HttpGet("order/{orderId}")]
    public async Task<ActionResult<IEnumerable<UploadedFileDto>>> GetFilesForOrder(int orderId)
    {
        var orderExists = await _context.Orders.AnyAsync(o => o.Id == orderId);
        if (!orderExists) return NotFound($"Order {orderId} not found.");

        var files = await _context.UploadedFiles
            .Where(f => f.OrderId == orderId)
            .OrderBy(f => f.UploadedAt)
            .Select(f => new UploadedFileDto
            {
                Id = f.Id,
                OrderId = f.OrderId,
                OriginalFileName = f.OriginalFileName,
                UploadedAt = f.UploadedAt,
                DownloadUrl = Url.Action(nameof(DownloadFile), "Files", new { id = f.Id }, Request.Scheme)!
            })
            .ToListAsync();

        return Ok(files);
    }

    // GET: api/Files/{id}/download
    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadFile(int id)
    {
        var uploadedFile = await _context.UploadedFiles.FindAsync(id);
        if (uploadedFile == null) return NotFound($"File {id} not found.");

        var physicalPath = Path.Combine(_env.WebRootPath, "uploads", uploadedFile.StoredFileName);
        if (!System.IO.File.Exists(physicalPath))
            return NotFound("File record exists in the database but the physical file is missing.");

        var contentType = GetContentType(uploadedFile.StoredFileName);
        var stream = new FileStream(physicalPath, FileMode.Open, FileAccess.Read);
        return File(stream, contentType, uploadedFile.OriginalFileName);
    }

    private static string GetContentType(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".tiff" => "image/tiff",
            ".tif" => "image/tiff",
            ".ai" => "application/postscript",
            ".eps" => "application/postscript",
            ".svg" => "image/svg+xml",
            _ => "application/octet-stream"
        };
    }
}