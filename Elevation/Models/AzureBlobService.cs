using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Elevation.Services;

public interface IBlobService
{
    Task<string> UploadAsync(Stream content, string storedFileName, string contentType);

    Task<(Stream stream, string contentType)> DownloadAsync(string storedFileName);

    Task DeleteAsync(string storedFileName);
}

public class AzureBlobService : IBlobService
{
    private readonly BlobContainerClient _container;

    public AzureBlobService(string connectionString, string containerName)
    {
        var serviceClient = new BlobServiceClient(connectionString);
        _container = serviceClient.GetBlobContainerClient(containerName);
  
        _container.CreateIfNotExists(PublicAccessType.Blob);
    }

    public async Task<string> UploadAsync(Stream content, string storedFileName, string contentType)
    {
        var blob = _container.GetBlobClient(storedFileName);
        await blob.UploadAsync(content, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
        });
        return blob.Uri.ToString();
    }

    public async Task<(Stream stream, string contentType)> DownloadAsync(string storedFileName)
    {
        var blob = _container.GetBlobClient(storedFileName);
        var response = await blob.DownloadAsync();
        var props = await blob.GetPropertiesAsync();
        return (response.Value.Content, props.Value.ContentType);
    }

    public async Task DeleteAsync(string storedFileName)
    {
        var blob = _container.GetBlobClient(storedFileName);
        await blob.DeleteIfExistsAsync();
    }
}