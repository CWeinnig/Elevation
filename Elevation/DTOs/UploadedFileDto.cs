namespace Elevation.DTOs;

public class UploadedFileDto
{
    public int Id { get; set; }
    public int? OrderId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public DateTime UploadedAt { get; set; }
    public string DownloadUrl { get; set; } = string.Empty;
}