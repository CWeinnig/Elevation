using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Elevation.Models;
using Elevation.DTOs;
using Elevation.Services;

namespace Elevation.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IBlobService _blob;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".ai", ".eps", ".svg"
    };

    private const long MaxFileSizeBytes = 50 * 1024 * 1024; // 50 MB

    public FilesController(AppDbContext context, IBlobService blob)
    {
        _context = context;
        _blob = blob;
    }

    // ── POST api/Files/upload ─────────────────────────────────────────────────
    [HttpPost("upload")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxFileSizeBytes)]
      public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int? orderId)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file received.");

        if (file.Length > MaxFileSizeBytes)
            return BadRequest("File exceeds the maximum allowed size of 50 MB.");

        var ext = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(ext))
            return BadRequest($"File type '{ext}' is not allowed. Accepted: {string.Join(", ", AllowedExtensions)}");
       
        var allowedMimeTypes = new HashSet<string>
     {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/tiff",
        "application/postscript",
        "image/svg+xml"
     };

        if (!allowedMimeTypes.Contains(file.ContentType))
        return BadRequest($"MIME type '{file.ContentType}' is not allowed.");

        if (orderId.HasValue && !await _context.Orders.AnyAsync(o => o.Id == orderId.Value))
            return BadRequest("Invalid Order ID.");

        var storedFileName = $"{Guid.NewGuid()}{ext}";
        var contentType = GetContentType(storedFileName);

        string blobUrl;
        using (var stream = file.OpenReadStream())
            blobUrl = await _blob.UploadAsync(stream, storedFileName, contentType);

        var record = new UploadedFile
        {
            OrderId = orderId,
            OriginalFileName = file.FileName,
            StoredFileName = storedFileName,
            FilePath = blobUrl,          // store the blob URL in FilePath
            UploadedAt = DateTime.UtcNow
        };

        _context.UploadedFiles.Add(record);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "File uploaded successfully",
            fileId = record.Id,
            downloadUrl = Url.Action(nameof(DownloadFile), "Files", new { id = record.Id }, Request.Scheme)
        });
    }

    // ── GET api/Files/all ─────────────────────────────────────────────────────
    [HttpGet("all")]
    public async Task<ActionResult<IEnumerable<UploadedFileDto>>> GetAllFiles()
    {
        var files = await _context.UploadedFiles
            .OrderByDescending(f => f.UploadedAt)
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

    // ── GET api/Files/order/{orderId} ─────────────────────────────────────────
    [HttpGet("order/{orderId}")]
    public async Task<ActionResult<IEnumerable<UploadedFileDto>>> GetFilesForOrder(int orderId)
    {
        if (!await _context.Orders.AnyAsync(o => o.Id == orderId))
            return NotFound($"Order {orderId} not found.");

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

    // ── GET api/Files/{id}/download ───────────────────────────────────────────
    // Streams the blob so the original filename is preserved in the download.
    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadFile(int id)
    {
        var record = await _context.UploadedFiles.FindAsync(id);
        if (record == null) return NotFound($"File {id} not found.");

        try
        {
            var (stream, contentType) = await _blob.DownloadAsync(record.StoredFileName);
            return File(stream, contentType, record.OriginalFileName);
        }
        catch
        {
            return NotFound("The file could not be retrieved from storage.");
        }
    }

    // ── DELETE api/Files/{id} ─────────────────────────────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteFile(int id)
    {
        var record = await _context.UploadedFiles.FindAsync(id);
        if (record == null) return NotFound();

        await _blob.DeleteAsync(record.StoredFileName);
        _context.UploadedFiles.Remove(record);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static string GetContentType(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() switch
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