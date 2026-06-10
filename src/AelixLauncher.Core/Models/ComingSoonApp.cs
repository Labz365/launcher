using System.Text.Json.Serialization;

namespace AelixLauncher.Core.Models;

/// <summary>One entry in coming-soon.json. No download action.</summary>
public class ComingSoonApp
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("eta")]
    public string? Eta { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("tag")]
    public string? Tag { get; set; }

    [JsonPropertyName("platform")]
    public string? Platform { get; set; }
}
