using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;   
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
    [Authorize]
    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadFile([FromForm] FileUploadRequest request)
    {
        var file = request.File;
        var orderId = request.OrderId;

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
        var order = await _context.Orders.FindAsync(orderId.Value);
        if (order == null)
        return BadRequest("Invalid Order ID.");

        var currentUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
         if (currentUserIdStr == null)
        return Unauthorized();

        var currentUserId = int.Parse(currentUserIdStr);

         if (!User.IsInRole("Admin"))
        {
        if (!order.UserId.HasValue || order.UserId.Value != currentUserId)
            return Forbid();
        }
        
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
    [Authorize]
    [HttpGet("order/{orderId}")]
    public async Task<ActionResult<IEnumerable<UploadedFileDto>>> GetFilesForOrder(int orderId)
    {
        var order = await _context.Orders.FindAsync(orderId);
    if (order == null) return NotFound($"Order {orderId} not found.");

    if (!User.IsInRole("Admin"))
    {
    var currentUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (currentUserIdStr == null) return Unauthorized();

    var currentUserId = int.Parse(currentUserIdStr);

    if (!order.UserId.HasValue || order.UserId.Value != currentUserId)
        return Forbid();
    }

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
    [Authorize]
    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadFile(int id)
    {
        var uploadedFile = await _context.UploadedFiles.FindAsync(id);
        if (uploadedFile == null) return NotFound($"File {id} not found.");

     if (uploadedFile.OrderId.HasValue)
    {
        var order = await _context.Orders.FindAsync(uploadedFile.OrderId.Value);
        if (order == null)
            return NotFound("Order not found for this file.");

        if (!User.IsInRole("Admin"))
        {
            var currentUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (currentUserIdStr == null)
                return Unauthorized();

            var currentUserId = int.Parse(currentUserIdStr);

            if (!order.UserId.HasValue || order.UserId.Value != currentUserId)
                return Forbid();
        }
    }
    else
    {
        // If file isn't attached to an order, only admins can access it
        if (!User.IsInRole("Admin"))
            return Forbid();
    }


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

public class FileUploadRequest
{
    public IFormFile File { get; set; } = default!;
    public int? OrderId { get; set; }
}