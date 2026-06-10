using System.Text.Json.Serialization;

namespace AelixLauncher.Core.Models;

/// <summary>One entry in %LOCALAPPDATA%\AelixStudio\installed.json.</summary>
public class InstalledApp
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public string? Version { get; set; }

    [JsonPropertyName("installDir")]
    public string InstallDir { get; set; } = string.Empty;

    /// <summary>Path of the launchable executable, if any (null for download-only items like APKs).</summary>
    [JsonPropertyName("executablePath")]
    public string? ExecutablePath { get; set; }

    [JsonPropertyName("installedAtUtc")]
    public DateTime InstalledAtUtc { get; set; }
}
