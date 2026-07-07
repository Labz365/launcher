namespace AelixLauncher.Core.Models;

/// <summary>
/// canvas.json in the catalog repo — describes the downloadable Aelix Canvas
/// module (version, release-asset URL, and required SHA-256 of the zip).
/// </summary>
public sealed class CanvasManifest
{
    public string Version { get; set; } = "0.0.0";
    public string Url { get; set; } = "";
    public string Sha256 { get; set; } = "";
}
