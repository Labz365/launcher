namespace AelixLauncher.Core;

/// <summary>
/// Central configuration for the launcher. Security-relevant values
/// (allowlisted hosts, allowed GitHub org) live here so they are easy
/// to audit and test.
/// </summary>
public static class LauncherConfig
{
    /// <summary>GitHub org that all catalog and download URLs must belong to.</summary>
    public const string AllowedOrg = "Labz365";

    public const string CatalogUrl = "https://raw.githubusercontent.com/Labz365/launcher/main/apps.json";
    public const string ComingSoonUrl = "https://raw.githubusercontent.com/Labz365/launcher/main/coming-soon.json";

    /// <summary>Optional remote metadata for the built-in Arcade (404 ⇒ built-in defaults are used).</summary>
    public const string MinigamesUrl = "https://raw.githubusercontent.com/Labz365/launcher/main/minigames.json";

    public const string RepoUrl = "https://github.com/Labz365/launcher";
    public const string WebsiteUrl = "https://www.aelixstudio.com";

    /// <summary>
    /// Manifest for the optional Aelix Canvas module (the built-in GUI IDE).
    /// 404 ⇒ Canvas is simply not offered. The manifest's download URL goes
    /// through the same allowlist + SHA-256 pipeline as catalog apps.
    /// </summary>
    public const string CanvasManifestUrl = "https://raw.githubusercontent.com/Labz365/launcher/main/canvas.json";

    /// <summary>
    /// Hosts a download may *start* from. The org check applies to these
    /// (the first path segment must equal <see cref="AllowedOrg"/>).
    /// </summary>
    public static readonly IReadOnlyList<string> AllowedInitialHosts = new[]
    {
        "github.com",
        "www.github.com",
        "raw.githubusercontent.com",
    };

    /// <summary>
    /// Additional hosts a download may be *redirected* to. GitHub serves
    /// release assets from opaque CDN hosts, so no org appears in the path;
    /// these are only ever reachable via a validated github.com URL.
    /// </summary>
    public static readonly IReadOnlyList<string> AllowedRedirectHosts = new[]
    {
        "github.com",
        "www.github.com",
        "raw.githubusercontent.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "github-releases.githubusercontent.com",
    };

    public static string RootDataDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AelixStudio");

    public static string AppsDir => Path.Combine(RootDataDir, "Apps");

    /// <summary>Install location of the optional Canvas module.</summary>
    public static string CanvasDir => Path.Combine(RootDataDir, "Canvas");

    public static string InstalledStateFile => Path.Combine(RootDataDir, "installed.json");
}
