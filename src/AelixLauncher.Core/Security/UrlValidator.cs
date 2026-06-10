namespace AelixLauncher.Core.Security;

public sealed record UrlValidationResult(bool IsValid, string? Error)
{
    public static UrlValidationResult Ok() => new(true, null);
    public static UrlValidationResult Fail(string error) => new(false, error);
}

/// <summary>
/// Validates download URLs against the security policy:
/// HTTPS only, host allowlist, and GitHub-org restriction.
/// Pure and dependency-free so it is trivially unit-testable.
/// </summary>
public static class UrlValidator
{
    /// <summary>
    /// Validate a URL taken from the catalog (the *initial* request URL).
    /// Must be HTTPS, on an allowed initial host, and the first path segment
    /// must equal the allowed org (case-insensitive).
    /// </summary>
    public static UrlValidationResult ValidateInitialUrl(
        string? url,
        IReadOnlyList<string>? allowedHosts = null,
        string? allowedOrg = null)
    {
        allowedHosts ??= LauncherConfig.AllowedInitialHosts;
        allowedOrg ??= LauncherConfig.AllowedOrg;

        if (string.IsNullOrWhiteSpace(url))
            return UrlValidationResult.Fail("No download URL provided.");

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return UrlValidationResult.Fail("The download URL is not a valid absolute URL.");

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return UrlValidationResult.Fail($"Only HTTPS downloads are allowed (got '{uri.Scheme}').");

        if (!IsHostAllowed(uri.Host, allowedHosts))
            return UrlValidationResult.Fail($"Host '{uri.Host}' is not on the allowlist.");

        // Org check: first path segment must equal the allowed org.
        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 ||
            !string.Equals(segments[0], allowedOrg, StringComparison.OrdinalIgnoreCase))
        {
            return UrlValidationResult.Fail(
                $"URL does not belong to the '{allowedOrg}' organization.");
        }

        return UrlValidationResult.Ok();
    }

    /// <summary>
    /// Validate a redirect target. GitHub serves release assets from opaque CDN
    /// hosts where the org does not appear in the path, so only HTTPS + host
    /// allowlist are enforced. A redirect URL is only ever reached *via* a
    /// fully validated initial URL.
    /// </summary>
    public static UrlValidationResult ValidateRedirectUrl(
        Uri? uri,
        IReadOnlyList<string>? allowedHosts = null)
    {
        allowedHosts ??= LauncherConfig.AllowedRedirectHosts;

        if (uri is null || !uri.IsAbsoluteUri)
            return UrlValidationResult.Fail("Redirect target is not a valid absolute URL.");

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return UrlValidationResult.Fail($"Redirected to a non-HTTPS URL ('{uri.Scheme}'), refusing.");

        if (!IsHostAllowed(uri.Host, allowedHosts))
            return UrlValidationResult.Fail($"Redirected to non-allowlisted host '{uri.Host}', refusing.");

        return UrlValidationResult.Ok();
    }

    private static bool IsHostAllowed(string host, IReadOnlyList<string> allowedHosts)
    {
        // Exact match only — "github.com.evil.com" must NOT pass.
        foreach (var allowed in allowedHosts)
        {
            if (string.Equals(host, allowed, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }
}
