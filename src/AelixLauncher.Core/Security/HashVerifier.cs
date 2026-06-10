using System.Security.Cryptography;

namespace AelixLauncher.Core.Security;

public static class HashVerifier
{
    public static string ComputeSha256(Stream stream)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static string ComputeSha256File(string filePath)
    {
        using var fs = File.OpenRead(filePath);
        return ComputeSha256(fs);
    }

    /// <summary>Case-insensitive comparison of hex digests; tolerates surrounding whitespace.</summary>
    public static bool Matches(string actualHex, string expectedHex)
    {
        if (string.IsNullOrWhiteSpace(actualHex) || string.IsNullOrWhiteSpace(expectedHex))
            return false;
        return string.Equals(actualHex.Trim(), expectedHex.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
