using AelixLauncher.Core.Services;
using Xunit;

namespace AelixLauncher.Core.Tests;

public class VersionComparerTests
{
    [Theory]
    [InlineData("v1.0.0", "1.0.0")]
    [InlineData("V2.1", "v2.1")]
    [InlineData(" v1.0.0 ", "1.0.0")]
    public void AreSame_IgnoresVPrefixAndWhitespace(string a, string b) =>
        Assert.True(VersionComparer.AreSame(a, b));

    [Theory]
    [InlineData("v1.0.0", "v1.0.1", true)]   // newer remote
    [InlineData("v1.0.0", "v2.0.0", true)]
    [InlineData("v1.0.0", "v1.0.0", false)]  // same
    [InlineData("v1.0.0", "1.0.0", false)]   // same modulo prefix
    [InlineData("v1.0.1", "v1.0.0", false)]  // remote older → no update prompt
    [InlineData(null, "v1.0.0", true)]       // nothing installed
    [InlineData("v1.0.0", null, false)]      // no remote version
    [InlineData("build-A", "build-B", true)] // unparseable but different
    public void IsUpdateAvailable_Behaviour(string? installed, string? remote, bool expected) =>
        Assert.Equal(expected, VersionComparer.IsUpdateAvailable(installed, remote));
}
