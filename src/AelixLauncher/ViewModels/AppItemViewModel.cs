using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using System.Windows.Input;
using AelixLauncher.Core;
using AelixLauncher.Core.Models;
using AelixLauncher.Core.Security;
using AelixLauncher.Core.Services;
using AelixLauncher.Mvvm;

namespace AelixLauncher.ViewModels;

public sealed class AppItemViewModel : ViewModelBase
{
    private readonly InstallStateService _stateService;
    private readonly InstallManager _installManager;

    private InstalledApp? _installed;
    private bool _isBusy;
    private double _progressPercent;
    private bool _progressIndeterminate;
    private string? _itemError;

    public CatalogApp App { get; }

    public AppItemViewModel(CatalogApp app, InstalledApp? installed,
        InstallStateService stateService, InstallManager installManager)
    {
        App = app;
        _installed = installed;
        _stateService = stateService;
        _installManager = installManager;

        PrimaryCommand = new AsyncRelayCommand(InstallOrUpdateAsync, () => !IsBusy && HasDownload);
        LaunchCommand = new RelayCommand(Launch, () => !IsBusy && CanLaunch);
        OpenFolderCommand = new RelayCommand(OpenFolder, () => _installed is not null && Directory.Exists(_installed.InstallDir));
        UninstallCommand = new AsyncRelayCommand(UninstallAsync, () => !IsBusy && _installed is not null);
    }

    // ---- Display ----
    /// <summary>Editorial row index, e.g. "01".</summary>
    public string IndexDisplay { get; set; } = "01";

    public string Name => App.Name;
    public string? Tag => App.Tag;
    public string? Platform => App.Platform;
    public string? Description => App.Description;
    public string VersionDisplay => App.Version ?? "";
    public string Initial => string.IsNullOrEmpty(App.Name) ? "?" : App.Name[..1].ToUpperInvariant();

    public bool HasDownload => !string.IsNullOrWhiteSpace(App.DownloadUrl);
    public bool IsWindowsApp => App.IsWindows;
    public bool IsInstalled => _installed is not null;
    public bool CanLaunch => _installed?.ExecutablePath is { } exe && File.Exists(exe);

    public bool UpdateAvailable =>
        _installed is not null && VersionComparer.IsUpdateAvailable(_installed.Version, App.Version);

    public string PrimaryActionText =>
        !IsWindowsApp
            ? (IsInstalled ? "Re-download" : "Download")
            : UpdateAvailable ? "Update"
            : IsInstalled ? "Reinstall"
            : "Install";

    public string StatusText =>
        ItemError is not null ? ItemError
        : !IsInstalled ? (HasDownload ? "Not installed" : "No download available")
        : UpdateAvailable ? $"Update available — installed {_installed!.Version}, latest {App.Version}"
        : IsWindowsApp || CanLaunch ? $"Installed {_installed!.Version}"
        : $"Downloaded {_installed!.Version}";

    public bool IsBusy { get => _isBusy; private set { Set(ref _isBusy, value); Refresh(); } }
    public double ProgressPercent { get => _progressPercent; private set => Set(ref _progressPercent, value); }
    public bool ProgressIndeterminate { get => _progressIndeterminate; private set => Set(ref _progressIndeterminate, value); }
    public string? ItemError { get => _itemError; private set { Set(ref _itemError, value); OnPropertyChanged(nameof(StatusText)); } }

    public ICommand PrimaryCommand { get; }
    public ICommand LaunchCommand { get; }
    public ICommand OpenFolderCommand { get; }
    public ICommand UninstallCommand { get; }

    // ---- Actions ----

    private async Task InstallOrUpdateAsync()
    {
        ItemError = null;

        // Explicit confirmation — the launcher never downloads or runs anything silently.
        var verb = PrimaryActionText.ToLowerInvariant();
        var host = Uri.TryCreate(App.DownloadUrl, UriKind.Absolute, out var u) ? u.Host : "?";
        var verified = string.IsNullOrWhiteSpace(App.Sha256)
            ? "Integrity hash: not provided by catalog."
            : "Integrity will be verified (SHA-256).";
        var answer = MessageBox.Show(
            $"{char.ToUpperInvariant(verb[0]) + verb[1..]} {App.Name} {App.Version}?\n\n" +
            $"Source: {host}\n{verified}",
            "Aelix Studio Launcher", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (answer != MessageBoxResult.Yes) return;

        IsBusy = true;
        ProgressPercent = 0;
        ProgressIndeterminate = true;
        try
        {
            var fileName = GetFileNameFromUrl(App.DownloadUrl!);
            var destDir = InstallManager.GetAppDir(App.Name);

            using var downloader = new DownloadService();
            var progress = new Progress<DownloadProgress>(p =>
            {
                if (p.Percent is { } pct) { ProgressIndeterminate = false; ProgressPercent = pct; }
            });

            var path = await downloader.DownloadAsync(
                App.DownloadUrl!, destDir, fileName, App.Sha256, progress);

            _installed = _installManager.CompleteInstall(App, path);
            Refresh();
        }
        catch (UrlPolicyException ex) { ItemError = "Blocked: " + ex.Message; }
        catch (HashMismatchException ex) { ItemError = ex.Message; }
        catch (HttpRequestException) { ItemError = "Download failed — check your connection and try again."; }
        catch (IOException ex) { ItemError = "File error: " + ex.Message; }
        catch (Exception ex) { ItemError = "Unexpected error: " + ex.Message; }
        finally
        {
            IsBusy = false;
            ProgressIndeterminate = false;
        }
    }

    private void Launch()
    {
        try
        {
            var exe = _installed?.ExecutablePath;
            if (exe is null || !File.Exists(exe))
            {
                ItemError = "Executable not found — try reinstalling.";
                Refresh();
                return;
            }
            Process.Start(new ProcessStartInfo(exe)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(exe)!,
            });
        }
        catch (Exception ex)
        {
            ItemError = "Could not launch: " + ex.Message;
        }
    }

    private void OpenFolder()
    {
        if (_installed is null) return;
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{_installed.InstallDir}\"")
            { UseShellExecute = true });
        }
        catch (Exception ex) { ItemError = "Could not open folder: " + ex.Message; }
    }

    private Task UninstallAsync()
    {
        if (_installed is null) return Task.CompletedTask;
        var answer = MessageBox.Show(
            $"Remove {App.Name} and delete its files?",
            "Aelix Studio Launcher", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (answer != MessageBoxResult.Yes) return Task.CompletedTask;

        try
        {
            _installManager.Uninstall(_installed);
            _installed = null;
            ItemError = null;
            Refresh();
        }
        catch (Exception ex) { ItemError = "Could not uninstall: " + ex.Message; }
        return Task.CompletedTask;
    }

    private static string GetFileNameFromUrl(string url)
    {
        var name = Uri.TryCreate(url, UriKind.Absolute, out var uri)
            ? Path.GetFileName(uri.LocalPath)
            : "";
        return string.IsNullOrWhiteSpace(name) ? "download.bin" : name;
    }

    private void Refresh()
    {
        OnPropertyChanged(nameof(IsInstalled));
        OnPropertyChanged(nameof(CanLaunch));
        OnPropertyChanged(nameof(UpdateAvailable));
        OnPropertyChanged(nameof(PrimaryActionText));
        OnPropertyChanged(nameof(StatusText));
    }
}
