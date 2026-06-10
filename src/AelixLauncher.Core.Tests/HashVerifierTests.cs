using System.Text;
using AelixLauncher.Core.Security;
using Xunit;

namespace AelixLauncher.Core.Tests;

public class HashVerifierTests
{
    // SHA-256("hello") — well-known vector.
    private const string HelloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    [Fact]
    public void ComputeSha256_KnownVector()
    {
        using var ms = new MemoryStream(Encoding.UTF8.GetBytes("hello"));
        Assert.Equal(HelloHash, HashVerifier.ComputeSha256(ms));
    }

    [Fact]
    public void ComputeSha256File_MatchesStreamHash()
    {
        var tmp = Path.GetTempFileName();
        try
        {
            File.WriteAllText(tmp, "hello");
            Assert.Equal(HelloHash, HashVerifier.ComputeSha256File(tmp));
        }
        finally { File.Delete(tmp); }
    }

    [Theory]
    [InlineData(HelloHash, true)]
    [InlineData("2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824", true)] // case-insensitive
    [InlineData("  " + HelloHash + "  ", true)]                                            // whitespace tolerated
    [InlineData("deadbeef", false)]
    [InlineData("", false)]
    public void Matches_Behaviour(string expected, bool shouldMatch)
    {
        Assert.Equal(shouldMatch, HashVerifier.Matches(HelloHash, expected));
    }
}
