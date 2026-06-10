using AelixLauncher.Core.Security;
using Xunit;

namespace AelixLauncher.Core.Tests;

public class UrlValidatorTests
{
    // ---- Initial URL: happy paths ----

    [Theory]
    [InlineData("https://github.com/Labz365/launcher/releases/download/sfme-v1.0.0/SFMe.apk")]
    [InlineData("https://github.com/labz365/launcher/releases/download/x/y.exe")] // org is case-insensitive
    [InlineData("https://raw.githubusercontent.com/Labz365/launcher/main/apps.json")]
    public void ValidInitialUrls_Pass(string url)
    {
        var result = UrlValidator.ValidateInitialUrl(url);
        Assert.True(result.IsValid, result.Error);
    }

    // ---- Initial URL: rejections ----

    [Theory]
    [InlineData("http://github.com/Labz365/launcher/releases/download/x/y.exe")]   // not HTTPS
    [InlineData("ftp://github.com/Labz365/x")]                                      // wrong scheme
    [InlineData("https://gitlab.com/Labz365/launcher/x.exe")]                       // wrong host
    [InlineData("https://github.com.evil.com/Labz365/launcher/x.exe")]              // host suffix attack
    [InlineData("https://evilgithub.com/Labz365/x.exe")]                            // host prefix attack
    [InlineData("https://github.com/SomeOtherOrg/launcher/releases/x.exe")]         // wrong org
    [InlineData("https://github.com/")]                                             // no org segment
    [InlineData("https://objects.githubusercontent.com/whatever/blob")]             // CDN not allowed as initial
    [InlineData("not a url")]
    [InlineData("")]
    [InlineData(null)]
    public void InvalidInitialUrls_AreRejected(string? url)
    {
        var result = UrlValidator.ValidateInitialUrl(url);
        Assert.False(result.IsValid);
        Assert.NotNull(result.Error);
    }

    // ---- Redirect URL ----

    [Theory]
    [InlineData("https://objects.githubusercontent.com/github-production-release-asset/abc123")]
    [InlineData("https://release-assets.githubusercontent.com/some/opaque/path")]
    [InlineData("https://github.com/Labz365/launcher/releases/download/x/y.exe")]
    public void ValidRedirects_Pass(string url)
    {
        var result = UrlValidator.ValidateRedirectUrl(new Uri(url));
        Assert.True(result.IsValid, result.Error);
    }

    [Theory]
    [InlineData("http://objects.githubusercontent.com/x")]     // downgrade to HTTP
    [InlineData("https://evil.example.com/payload.exe")]       // off-allowlist host
    [InlineData("https://objects.githubusercontent.com.evil.net/x")]
    public void InvalidRedirects_AreRejected(string url)
    {
        var result = UrlValidator.ValidateRedirectUrl(new Uri(url));
        Assert.False(result.IsValid);
    }
}
