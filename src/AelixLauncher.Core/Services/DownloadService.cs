using System.Security.Cryptography;
using AelixLauncher.Core.Security;

namespace AelixLauncher.Core.Services;

public sealed record DownloadProgress(long BytesReceived, long? TotalBytes)
{
    public double? Percent => TotalBytes is > 0 ? (double)BytesReceived / TotalBytes.Value * 100.0 : null;
}

/// <summary>
/// Downloads files with the full security policy applied:
/// HTTPS only, host allowlist + org check on the initial URL, every redirect
/// hop re-validated (auto-redirect is disabled), streamed to an isolated
/// destination folder, and optional SHA-256 verification before the file is
/// surfaced to the caller. Hash failures delete the file and throw.
/// </summary>
public sealed class DownloadService : IDisposable
{
    private const int MaxRedirects = 10;
    private readonly HttpClient _client;

    /// <param name="handler">Injectable for tests; defaults to a handler with auto-redirect OFF.</param>
    public DownloadService(HttpMessageHandler? handler = null)
    {
        _client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false })
        {
            Timeout = TimeSpan.FromMinutes(10),
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("AelixStudioLauncher/1.0");
    }

    /// <summary>
    /// Download <paramref name="url"/> into <paramref name="destinationDir"/> as
    /// <paramref name="fileName"/>. If <paramref name="expectedSha256"/> is non-empty
    /// the file is verified before being moved into place.
    /// </summary>
    /// <returns>The full path of the downloaded, verified file.</returns>
    public async Task<string> DownloadAsync(
        string url,
        string destinationDir,
        string fileName,
        string? expectedSha256 = null,
        IProgress<DownloadProgress>? progress = null,
        CancellationToken ct = default)
    {
        var initialCheck = UrlValidator.ValidateInitialUrl(url);
        if (!initialCheck.IsValid)
            throw new UrlPolicyException(initialCheck.Error!);

        Directory.CreateDirectory(destinationDir);
        var finalPath = Path.Combine(destinationDir, SanitizeFileName(fileName));
        var partialPath = finalPath + ".partial";

        var response = await SendFollowingValidatedRedirectsAsync(new Uri(url), ct).ConfigureAwait(false);

        try
        {
            response.EnsureSuccessStatusCode();

            long? totalBytes = response.Content.Headers.ContentLength;
            string actualHash;

            await using (var httpStream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false))
            await using (var fileStream = new FileStream(partialPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            using (var sha = SHA256.Create())
            {
                var buffer = new byte[81920];
                long received = 0;
                int read;
                while ((read = await httpStream.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
                {
                    await fileStream.WriteAsync(buffer.AsMemory(0, read), ct).ConfigureAwait(false);
                    sha.TransformBlock(buffer, 0, read, null, 0);
                    received += read;
                    progress?.Report(new DownloadProgress(received, totalBytes));
                }
                sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
                actualHash = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
            }

            if (!string.IsNullOrWhiteSpace(expectedSha256) &&
                !HashVerifier.Matches(actualHash, expectedSha256))
            {
                TryDelete(partialPath);
                throw new HashMismatchException(expectedSha256.Trim(), actualHash);
            }

            File.Move(partialPath, finalPath, overwrite: true);
            return finalPath;
        }
        catch
        {
            TryDelete(partialPath);
            throw;
        }
        finally
        {
            response.Dispose();
        }
    }

    /// <summary>
    /// Issue the request with auto-redirect disabled and validate every hop
    /// against the redirect allowlist, so a compromised endpoint cannot bounce
    /// us to an arbitrary host.
    /// </summary>
    private async Task<HttpResponseMessage> SendFollowingValidatedRedirectsAsync(Uri uri, CancellationToken ct)
    {
        var current = uri;
        for (var hop = 0; hop <= MaxRedirects; hop++)
        {
            var response = await _client
                .GetAsync(current, HttpCompletionOption.ResponseHeadersRead, ct)
                .ConfigureAwait(false);

            if (!IsRedirect(response.StatusCode))
                return response;

            var location = response.Headers.Location;
            response.Dispose();

            if (location is null)
                throw new UrlPolicyException("Server sent a redirect without a Location header.");

            if (!location.IsAbsoluteUri)
                location = new Uri(current, location);

            var check = UrlValidator.ValidateRedirectUrl(location);
            if (!check.IsValid)
                throw new UrlPolicyException(check.Error!);

            current = location;
        }
        throw new UrlPolicyException($"Too many redirects (more than {MaxRedirects}).");
    }

    private static bool IsRedirect(System.Net.HttpStatusCode code) =>
        (int)code is 301 or 302 or 303 or 307 or 308;

    private static string SanitizeFileName(string name)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        // Path.GetFileName strips any directory components (defense against "..\..\evil.exe").
        var safe = Path.GetFileName(name);
        return string.IsNullOrWhiteSpace(safe) ? "download.bin" : safe;
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* best effort */ }
    }

    public void Dispose() => _client.Dispose();
}
