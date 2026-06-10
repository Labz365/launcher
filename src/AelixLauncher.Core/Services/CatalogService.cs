using System.Text.Json;
using AelixLauncher.Core.Models;

namespace AelixLauncher.Core.Services;

public class CatalogException : Exception
{
    public CatalogException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>Fetches and parses apps.json / coming-soon.json from the catalog repo.</summary>
public sealed class CatalogService : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    private readonly HttpClient _client;

    public CatalogService(HttpMessageHandler? handler = null)
    {
        _client = handler is null ? new HttpClient() : new HttpClient(handler);
        _client.Timeout = TimeSpan.FromSeconds(30);
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("AelixStudioLauncher/1.0");
    }

    public Task<List<CatalogApp>> GetAppsAsync(CancellationToken ct = default) =>
        FetchListAsync<CatalogApp>(LauncherConfig.CatalogUrl, "app catalog", ct);

    public Task<List<ComingSoonApp>> GetComingSoonAsync(CancellationToken ct = default) =>
        FetchListAsync<ComingSoonApp>(LauncherConfig.ComingSoonUrl, "coming-soon list", ct);

    /// <summary>
    /// Fetch optional Arcade metadata. Unlike the catalogs this never throws:
    /// a missing or malformed minigames.json simply means "use built-in defaults".
    /// </summary>
    public async Task<List<MinigameInfo>?> GetMinigamesAsync(CancellationToken ct = default)
    {
        try
        {
            return await FetchListAsync<MinigameInfo>(LauncherConfig.MinigamesUrl, "minigames list", ct)
                .ConfigureAwait(false);
        }
        catch (CatalogException)
        {
            return null;
        }
    }

    private async Task<List<T>> FetchListAsync<T>(string url, string what, CancellationToken ct)
    {
        string json;
        try
        {
            json = await _client.GetStringAsync(url, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new CatalogException(
                $"Could not reach the {what}. Check your internet connection and try again.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new CatalogException($"Fetching the {what} timed out. Try again.", ex);
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, JsonOptions) ?? new List<T>();
        }
        catch (JsonException ex)
        {
            throw new CatalogException(
                $"The {what} could not be read (malformed JSON). The catalog may be mid-update — try again shortly.", ex);
        }
    }

    public void Dispose() => _client.Dispose();
}
