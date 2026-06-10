using System.Text.Json.Serialization;

namespace AelixLauncher.Core.Models;

/// <summary>
/// One entry in the optional minigames.json. The games themselves are built
/// into the launcher (identified by <see cref="Key"/>); the repo file only
/// overrides display metadata or disables a game. Unknown keys are ignored.
/// </summary>
public class MinigameInfo
{
    /// <summary>Built-in game id, e.g. "snake" or "reflex".</summary>
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("tag")]
    public string? Tag { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    /// <summary>Optional override for the "source" link (defaults to the launcher repo).</summary>
    [JsonPropertyName("sourceUrl")]
    public string? SourceUrl { get; set; }
}
