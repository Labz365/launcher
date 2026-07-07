using System.IO.Compression;
using System.Text.Json;
using AelixLauncher.Core.Models;

namespace AelixLauncher.Core.Services;

public class CanvasException : Exception
{
    public CanvasException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// Manages the optional Aelix Canvas module (the GUI IDE): manifest lookup,
/// verified download (SHA-256 required, same URL policy as apps), atomic
/// install into <see cref="LauncherConfig.CanvasDir"/>, and version tracking.
/// Canvas is NOT bundled with the launcher — users who want it download it
/// from the CANVAS tab; everyone else pays zero bytes.
/// </summary>
public sealed class CanvasService : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    private readonly HttpClient _client;
    private readonly DownloadService _downloader;

    public CanvasService(HttpMessageHandler? manifestHandler = null, DownloadService? downloader = null)
    {
        _client = manifestHandler is null ? new HttpClient() : new HttpClient(manifestHandler);
        _client.Timeout = TimeSpan.FromSeconds(30);
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("AelixStudioLauncher/1.0");
        _downloader = downloader ?? new DownloadService();
    }

    public static string IndexPath => Path.Combine(LauncherConfig.CanvasDir, "index.html");
    private static string VersionFile => Path.Combine(LauncherConfig.CanvasDir, ".version");

    /// <summary>Installed version, or null if Canvas is not installed.</summary>
    public static string? InstalledVersion()
    {
        if (!File.Exists(IndexPath)) return null;
        try { return File.Exists(VersionFile) ? File.ReadAllText(VersionFile).Trim() : "unknown"; }
        catch (IOException) { return "unknown"; }
    }

    /// <summary>Fetch canvas.json. Throws <see cref="CanvasException"/> with a friendly message.</summary>
    public async Task<CanvasManifest> GetManifestAsync(CancellationToken ct = default)
    {
        string json;
        try
        {
            json = await _client.GetStringAsync(LauncherConfig.CanvasManifestUrl, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new CanvasException("Couldn't reach the Canvas download info. Check your connection and try again.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new CanvasException("Fetching Canvas download info timed out. Try again.", ex);
        }

        CanvasManifest? m;
        try { m = JsonSerializer.Deserialize<CanvasManifest>(json, JsonOptions); }
        catch (JsonException ex) { throw new CanvasException("Canvas download info is malformed. Try again later.", ex); }

        if (m is null || string.IsNullOrWhiteSpace(m.Url))
            throw new CanvasException("Canvas download info is incomplete.");
        if (string.IsNullOrWhiteSpace(m.Sha256))
            throw new CanvasException("Canvas download info is missing its integrity hash — refusing to download.");
        return m;
    }

    /// <summary>
    /// Download and install the module described by <paramref name="manifest"/>.
    /// The zip is allowlist/redirect validated and SHA-256 verified by
    /// <see cref="DownloadService"/>; extraction is staged and swapped in so a
    /// failed install never leaves a broken half-copy behind.
    /// </summary>
    public async Task InstallAsync(
        CanvasManifest manifest,
        IProgress<DownloadProgress>? progress = null,
        CancellationToken ct = default)
    {
        var tmpDir = Path.Combine(LauncherConfig.RootDataDir, "Canvas.tmp");
        if (Directory.Exists(tmpDir)) Directory.Delete(tmpDir, recursive: true);
        Directory.CreateDirectory(tmpDir);

        try
        {
            var zipPath = await _downloader.DownloadAsync(
                manifest.Url, tmpDir, "aelix-canvas-web.zip", manifest.Sha256, progress, ct)
                .ConfigureAwait(false);

            var stage = Path.Combine(tmpDir, "extracted");
            // .NET's ExtractToDirectory protects against zip-slip path traversal.
            ZipFile.ExtractToDirectory(zipPath, stage);

            // Zip may contain the files at the root or inside a single top folder.
            var root = File.Exists(Path.Combine(stage, "index.html"))
                ? stage
                : Directory.EnumerateDirectories(stage)
                    .FirstOrDefault(d => File.Exists(Path.Combine(d, "index.html")))
                  ?? throw new CanvasException("The Canvas package is missing index.html.");

            File.WriteAllText(Path.Combine(root, ".version"), manifest.Version);

            if (Directory.Exists(LauncherConfig.CanvasDir))
                Directory.Delete(LauncherConfig.CanvasDir, recursive: true);
            Directory.CreateDirectory(Path.GetDirectoryName(LauncherConfig.CanvasDir)!);
            Directory.Move(root, LauncherConfig.CanvasDir);
        }
        finally
        {
            try { if (Directory.Exists(tmpDir)) Directory.Delete(tmpDir, recursive: true); }
            catch (IOException) { /* best effort cleanup */ }
        }
    }

    /// <summary>Remove the installed module (frees disk; tab reverts to the download offer).</summary>
    public static void Uninstall()
    {
        if (Directory.Exists(LauncherConfig.CanvasDir))
            Directory.Delete(LauncherConfig.CanvasDir, recursive: true);
    }

    public void Dispose()
    {
        _client.Dispose();
        _downloader.Dispose();
    }
}
