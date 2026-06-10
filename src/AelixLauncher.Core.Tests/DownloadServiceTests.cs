using System.Net;
using AelixLauncher.Core.Security;
using AelixLauncher.Core.Services;
using Xunit;

namespace AelixLauncher.Core.Tests;

/// <summary>
/// End-to-end tests of the download pipeline using a fake HTTP handler:
/// redirect policy, hash verification, and cleanup on failure.
/// </summary>
public class DownloadServiceTests : IDisposable
{
    private const string GoodUrl = "https://github.com/Labz365/launcher/releases/download/v1/app.bin";
    private const string Payload = "hello";
    private const string PayloadHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "aelix-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        public FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(_responder(request));
    }

    private static HttpResponseMessage Content(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body) };

    private static HttpResponseMessage Redirect(string location)
    {
        var r = new HttpResponseMessage(HttpStatusCode.Redirect);
        r.Headers.Location = new Uri(location);
        return r;
    }

    [Fact]
    public async Task RejectsNonHttpsInitialUrl()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));
        await Assert.ThrowsAsync<UrlPolicyException>(() =>
            svc.DownloadAsync("http://github.com/Labz365/x/a.bin", _dir, "a.bin"));
    }

    [Fact]
    public async Task RejectsWrongOrg()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));
        await Assert.ThrowsAsync<UrlPolicyException>(() =>
            svc.DownloadAsync("https://github.com/EvilOrg/x/a.bin", _dir, "a.bin"));
    }

    [Fact]
    public async Task RejectsRedirectToUnknownHost()
    {
        using var svc = new DownloadService(new FakeHandler(req =>
            req.RequestUri!.Host == "github.com"
                ? Redirect("https://evil.example.com/payload.bin")
                : Content(Payload)));

        await Assert.ThrowsAsync<UrlPolicyException>(() =>
            svc.DownloadAsync(GoodUrl, _dir, "a.bin"));
        Assert.False(File.Exists(Path.Combine(_dir, "a.bin")));
    }

    [Fact]
    public async Task FollowsValidRedirectToGitHubCdn()
    {
        using var svc = new DownloadService(new FakeHandler(req =>
            req.RequestUri!.Host == "github.com"
                ? Redirect("https://objects.githubusercontent.com/opaque/asset")
                : Content(Payload)));

        var path = await svc.DownloadAsync(GoodUrl, _dir, "a.bin", PayloadHash);
        Assert.True(File.Exists(path));
        Assert.Equal(Payload, File.ReadAllText(path));
    }

    [Fact]
    public async Task HashMismatch_ThrowsAndDeletesFile()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));

        var ex = await Assert.ThrowsAsync<HashMismatchException>(() =>
            svc.DownloadAsync(GoodUrl, _dir, "a.bin",
                "0000000000000000000000000000000000000000000000000000000000000000"));

        Assert.Equal(PayloadHash, ex.Actual);
        Assert.False(File.Exists(Path.Combine(_dir, "a.bin")));
        Assert.False(File.Exists(Path.Combine(_dir, "a.bin.partial")));
    }

    [Fact]
    public async Task MatchingHash_Succeeds_CaseInsensitive()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));
        var path = await svc.DownloadAsync(GoodUrl, _dir, "a.bin", PayloadHash.ToUpperInvariant());
        Assert.True(File.Exists(path));
    }

    [Fact]
    public async Task NoHashInCatalog_DownloadStillSucceeds()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));
        var path = await svc.DownloadAsync(GoodUrl, _dir, "a.bin", expectedSha256: null);
        Assert.True(File.Exists(path));
    }

    [Fact]
    public async Task PathTraversalFileName_IsSanitized()
    {
        using var svc = new DownloadService(new FakeHandler(_ => Content(Payload)));
        var path = await svc.DownloadAsync(GoodUrl, _dir, "..\\..\\evil.exe");
        // Must stay inside the destination directory.
        Assert.StartsWith(Path.GetFullPath(_dir), Path.GetFullPath(path));
    }
}
