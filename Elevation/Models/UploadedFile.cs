using System.Text.Json.Serialization;

namespace Elevation.Models;
public class UploadedFile
{
    public int Id { get; set; }

    public int OrderId { get; set; }
    [JsonIgnore]
    public Order? Order { get; set; }

    public string OriginalFileName { get; set; }
    public string StoredFileName { get; set; }

    public string FilePath { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}
