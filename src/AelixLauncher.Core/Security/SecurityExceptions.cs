namespace AelixLauncher.Core.Security;

/// <summary>Thrown when a URL fails the HTTPS / allowlist / org policy.</summary>
public class UrlPolicyException : Exception
{
    public UrlPolicyException(string message) : base(message) { }
}

/// <summary>Thrown when a downloaded file's SHA-256 does not match the catalog value.</summary>
public class HashMismatchException : Exception
{
    public string Expected { get; }
    public string Actual { get; }

    public HashMismatchException(string expected, string actual)
        : base("The downloaded file failed integrity verification (SHA-256 mismatch). " +
               "The file has been deleted. It may have been corrupted or tampered with.")
    {
        Expected = expected;
        Actual = actual;
    }
}
