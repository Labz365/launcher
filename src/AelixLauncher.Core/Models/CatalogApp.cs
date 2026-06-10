using System.Text.Json.Serialization;

namespace AelixLauncher.Core.Models;

/// <summary>One entry in apps.json. New fields (sha256, iconUrl) are optional.</summary>
public class CatalogApp
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("tag")]
    public string? Tag { get; set; }

    [JsonPropertyName("platform")]
    public string? Platform { get; set; }

    [JsonPropertyName("version")]
    public string? Version { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("downloadUrl")]
    public string? DownloadUrl { get; set; }

    /// <summary>Optional hex-encoded SHA-256 of the release asset. Verified before install when present.</summary>
    [JsonPropertyName("sha256")]
    public string? Sha256 { get; set; }

    /// <summary>Optional icon URL (same allowlist rules apply).</summary>
    [JsonPropertyName("iconUrl")]
    public string? IconUrl { get; set; }

    [JsonIgnore]
    public bool IsWindows =>
        string.Equals(Platform?.Trim(), "Windows", StringComparison.OrdinalIgnoreCase);
}
