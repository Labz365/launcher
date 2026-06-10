using System.Text.Json;
using AelixLauncher.Core.Models;

namespace AelixLauncher.Core.Services;

/// <summary>
/// Persists installed-app state to installed.json (atomic writes).
/// A malformed state file is backed up and replaced rather than crashing.
/// </summary>
public sealed class InstallStateService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    private readonly string _stateFile;
    private readonly object _lock = new();

    public InstallStateService(string? stateFile = null)
    {
        _stateFile = stateFile ?? LauncherConfig.InstalledStateFile;
    }

    public List<InstalledApp> Load()
    {
        lock (_lock)
        {
            if (!File.Exists(_stateFile))
                return new List<InstalledApp>();

            try
            {
                var json = File.ReadAllText(_stateFile);
                return JsonSerializer.Deserialize<List<InstalledApp>>(json, JsonOptions) ?? new List<InstalledApp>();
            }
            catch (JsonException)
            {
                // Corrupt state: keep a backup for inspection, start fresh.
                try { File.Move(_stateFile, _stateFile + ".corrupt.bak", overwrite: true); } catch { }
                return new List<InstalledApp>();
            }
        }
    }

    public InstalledApp? Get(int appId) => Load().FirstOrDefault(a => a.Id == appId);

    public void Upsert(InstalledApp app)
    {
        lock (_lock)
        {
            var list = Load();
            list.RemoveAll(a => a.Id == app.Id);
            list.Add(app);
            Save(list);
        }
    }

    public void Remove(int appId)
    {
        lock (_lock)
        {
            var list = Load();
            list.RemoveAll(a => a.Id == appId);
            Save(list);
        }
    }

    private void Save(List<InstalledApp> list)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_stateFile)!);
        var tmp = _stateFile + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(list, JsonOptions));
        File.Move(tmp, _stateFile, overwrite: true);
    }
}
