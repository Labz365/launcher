using System.Collections.ObjectModel;
using System.Diagnostics;
using AelixLauncher.Core;
using AelixLauncher.Core.Models;
using AelixLauncher.Core.Services;
using AelixLauncher.Mvvm;

namespace AelixLauncher.ViewModels;

public sealed class MainViewModel : ViewModelBase
{
    private readonly InstallStateService _stateService = new();
    private readonly InstallManager _installManager;

    private bool _isLoading;
    private string? _errorMessage;

    public ObservableCollection<AppItemViewModel> Apps { get; } = new();
    public ObservableCollection<ComingSoonApp> ComingSoon { get; } = new();
    public ObservableCollection<MinigameViewModel> Minigames { get; } = new();

    public AsyncRelayCommand RefreshCommand { get; }
    public RelayCommand OpenWebsiteCommand { get; }
    public RelayCommand OpenRepoCommand { get; }

    public MainViewModel()
    {
        _installManager = new InstallManager(_stateService);
        RefreshCommand = new AsyncRelayCommand(LoadAsync, () => !IsLoading);
        OpenWebsiteCommand = new RelayCommand(() => OpenUrl(LauncherConfig.WebsiteUrl));
        OpenRepoCommand = new RelayCommand(() => OpenUrl(LauncherConfig.RepoUrl));
        LoadDefaultMinigames();
    }

    public bool IsLoading { get => _isLoading; private set { Set(ref _isLoading, value); OnPropertyChanged(nameof(HasError)); } }
    public string? ErrorMessage
    {
        get => _errorMessage;
        private set { Set(ref _errorMessage, value); OnPropertyChanged(nameof(HasError)); }
    }
    public bool HasError => !string.IsNullOrEmpty(ErrorMessage);
    public bool HasComingSoon => ComingSoon.Count > 0;

    public async Task LoadAsync()
    {
        IsLoading = true;
        ErrorMessage = null;
        try
        {
            using var catalog = new CatalogService();
            var appsTask = catalog.GetAppsAsync();
            var soonTask = catalog.GetComingSoonAsync();
            var gamesTask = catalog.GetMinigamesAsync(); // never throws; null ⇒ defaults
            await Task.WhenAll(appsTask, soonTask, gamesTask);

            var installed = _stateService.Load();

            Apps.Clear();
            var index = 1;
            foreach (var app in appsTask.Result)
            {
                var inst = installed.FirstOrDefault(i => i.Id == app.Id);
                Apps.Add(new AppItemViewModel(app, inst, _stateService, _installManager)
                {
                    IndexDisplay = index.ToString("00"),
                });
                index++;
            }

            ComingSoon.Clear();
            foreach (var s in soonTask.Result)
                ComingSoon.Add(s);
            OnPropertyChanged(nameof(HasComingSoon));

            ApplyMinigameOverrides(gamesTask.Result);
        }
        catch (CatalogException ex)
        {
            ErrorMessage = ex.Message;
        }
        catch (Exception ex)
        {
            ErrorMessage = "Unexpected error while loading the catalog: " + ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    // ── Arcade ──

    private void LoadDefaultMinigames()
    {
        Minigames.Clear();
        Minigames.Add(new MinigameViewModel(
            "snake", "Serpent.", "C L A S S I C",
            "The classic, in studio colours. Arrow keys or WASD. Eat, grow, don't fold in on yourself."));
        Minigames.Add(new MinigameViewModel(
            "reflex", "Reflex.", "R E A C T I O N",
            "Thirty seconds, shrinking targets. Click them before they fade. How sharp are you today?"));
        Minigames.Add(new MinigameViewModel(
            "pong", "Rally.", "V E R S U S",
            "First to seven against the house. The angles are yours to choose — the machine never blinks."));
        Minigames.Add(new MinigameViewModel(
            "pairs", "Pairs.", "M E M O R Y",
            "Sixteen cards, eight pairs, one quiet test of recall. Fewer moves, better score."));
    }

    /// <summary>Apply optional minigames.json from the repo over the built-in list.</summary>
    private void ApplyMinigameOverrides(List<MinigameInfo>? remote)
    {
        if (remote is null) return;

        var defaults = Minigames.ToDictionary(m => m.Key, m => m);
        Minigames.Clear();
        foreach (var info in remote)
        {
            if (!info.Enabled) continue;
            if (!defaults.TryGetValue(info.Key, out var d)) continue; // unknown key: no such built-in game
            Minigames.Add(new MinigameViewModel(
                d.Key,
                string.IsNullOrWhiteSpace(info.Name) ? d.Name : info.Name!,
                string.IsNullOrWhiteSpace(info.Tag) ? d.Tag : info.Tag!,
                string.IsNullOrWhiteSpace(info.Description) ? d.Description : info.Description!,
                info.SourceUrl ?? d.SourceUrl));
        }

        // A remote list that disables everything (or matches nothing) falls back to defaults.
        if (Minigames.Count == 0)
            LoadDefaultMinigames();
    }

    private static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { /* non-critical */ }
    }
}
