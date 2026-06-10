namespace AelixLauncher.Core.Services;

/// <summary>
/// Best-effort version comparison: strips a leading "v", parses dotted numeric
/// versions when possible, falls back to case-insensitive string inequality.
/// </summary>
public static class VersionComparer
{
    public static string Normalize(string? version)
    {
        var v = (version ?? string.Empty).Trim();
        if (v.StartsWith("v", StringComparison.OrdinalIgnoreCase))
            v = v[1..];
        return v;
    }

    public static bool AreSame(string? a, string? b) =>
        string.Equals(Normalize(a), Normalize(b), StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// True when the remote (catalog) version differs from the locally installed one.
    /// When both parse as System.Version, "update" additionally means remote &gt; local,
    /// so a catalog rollback does not show a misleading "Update available".
    /// </summary>
    public static bool IsUpdateAvailable(string? installed, string? remote)
    {
        if (string.IsNullOrWhiteSpace(remote)) return false;
        if (string.IsNullOrWhiteSpace(installed)) return true;
        if (AreSame(installed, remote)) return false;

        var localCore = StripSuffix(Normalize(installed));
        var remoteCore = StripSuffix(Normalize(remote));
        if (Version.TryParse(Pad(localCore), out var lv) &&
            Version.TryParse(Pad(remoteCore), out var rv))
        {
            if (rv != lv) return rv > lv;
            // Same numeric core, different suffix (e.g. -beta) — treat as update.
            return true;
        }

        // Unparseable: any difference counts as an update.
        return true;
    }

    private static string StripSuffix(string v)
    {
        var i = v.IndexOfAny(new[] { '-', '+', ' ' });
        return i >= 0 ? v[..i] : v;
    }

    /// <summary>System.Version needs at least major.minor; pad "2" to "2.0".</summary>
    private static string Pad(string v) => v.Contains('.') ? v : v + ".0";
}
