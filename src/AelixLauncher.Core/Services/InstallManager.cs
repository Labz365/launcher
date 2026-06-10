using System.IO.Compression;
using AelixLauncher.Core.Models;

namespace AelixLauncher.Core.Services;

/// <summary>
/// Turns a downloaded (already hash-verified) file into an installed app inside
/// the isolated per-app folder, and records it in installed.json.
/// Never executes anything — launching is a separate, explicit user action.
/// </summary>
public sealed class InstallManager
{
    private readonly InstallStateService _state;

    public InstallManager(InstallStateService state) => _state = state;

    public static string GetAppDir(string appName)
    {
        var safe = string.Concat(appName.Split(Path.GetInvalidFileNameChars(),
            StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (string.IsNullOrEmpty(safe)) safe = "App";
        return Path.Combine(LauncherConfig.AppsDir, safe);
    }

    /// <summary>
    /// Register the downloaded file. Zips are extracted (the first .exe found
    /// becomes the launch target); a bare .exe is the launch target itself;
    /// anything else (e.g. .apk) is stored download-only.
    /// </summary>
    public InstalledApp CompleteInstall(CatalogApp app, string downloadedFile)
    {
        var appDir = Path.GetDirectoryName(downloadedFile)!;
        string? exePath = null;

        var ext = Path.GetExtension(downloadedFile).ToLowerInvariant();
        if (ext == ".zip")
        {
            var extractDir = Path.Combine(appDir, "app");
            if (Directory.Exists(extractDir)) Directory.Delete(extractDir, recursive: true);
            // .NET's ExtractToDirectory protects against zip-slip path traversal.
            ZipFile.ExtractToDirectory(downloadedFile, extractDir);
            exePath = Directory
                .EnumerateFiles(extractDir, "*.exe", SearchOption.AllDirectories)
                .OrderBy(p => p.Count(c => c is '\\' or '/')) // prefer shallowest
                .ThenBy(p => p, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
            File.Delete(downloadedFile); // keep only the extracted app
        }
        else if (ext == ".exe")
        {
            exePath = downloadedFile;
        }
        // else: download-only payload (e.g. .apk) — no executable recorded.

        var installed = new InstalledApp
        {
            Id = app.Id,
            Name = app.Name,
            Version = app.Version,
            InstallDir = appDir,
            ExecutablePath = exePath,
            InstalledAtUtc = DateTime.UtcNow,
        };
        _state.Upsert(installed);
        return installed;
    }

    public void Uninstall(InstalledApp app)
    {
        if (Directory.Exists(app.InstallDir) &&
            app.InstallDir.StartsWith(LauncherConfig.AppsDir, StringComparison.OrdinalIgnoreCase))
        {
            Directory.Delete(app.InstallDir, recursive: true);
        }
        _state.Remove(app.Id);
    }
}
