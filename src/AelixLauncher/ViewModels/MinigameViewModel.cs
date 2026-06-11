using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using AelixLauncher.Core;
using AelixLauncher.Games;
using AelixLauncher.Mvvm;

namespace AelixLauncher.ViewModels;

/// <summary>
/// One Arcade card. Games are built into the launcher and identified by Key;
/// display metadata can be overridden by minigames.json in the catalog repo.
/// </summary>
public sealed class MinigameViewModel : ViewModelBase
{
    public string Key { get; }
    public string Name { get; }
    public string Tag { get; }
    public string Description { get; }
    public string SourceUrl { get; }

    public ICommand PlayCommand { get; }
    public ICommand OpenSourceCommand { get; }

    public MinigameViewModel(string key, string name, string tag, string description, string? sourceUrl = null)
    {
        Key = key;
        Name = name;
        Tag = tag;
        Description = description;
        SourceUrl = sourceUrl ?? LauncherConfig.RepoUrl;

        PlayCommand = new RelayCommand(Play);
        OpenSourceCommand = new RelayCommand(OpenSource);
    }

    private void Play()
    {
        Window? game = Key switch
        {
            "snake" => new SnakeWindow(),
            "reflex" => new ReflexWindow(),
            "pong" => new PongWindow(),
            "pairs" => new MemoryWindow(),
            _ => null,
        };
        if (game is null) return;
        game.Owner = Application.Current.MainWindow;
        game.ShowDialog();
    }

    private void OpenSource()
    {
        // Fixed, validated destinations only (our org's GitHub).
        if (Uri.TryCreate(SourceUrl, UriKind.Absolute, out var uri) &&
            uri.Scheme == Uri.UriSchemeHttps &&
            (uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase) ||
             uri.Host.EndsWith(".github.com", StringComparison.OrdinalIgnoreCase)))
        {
            Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
    }
}
