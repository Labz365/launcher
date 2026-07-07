using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using AelixLauncher.Core;
using AelixLauncher.Core.Services;
using AelixLauncher.ViewModels;
using Microsoft.Web.WebView2.Core;

namespace AelixLauncher;

public partial class MainWindow : Window
{
    private readonly MainViewModel _vm = new();
    private bool _canvasBusy;
    private bool _canvasLoaded;

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _vm;
        Loaded += async (_, _) =>
        {
            PlayHeroEntrance();
            await _vm.LoadAsync();
        };
    }

    // ── navigation ──
    private enum Section { Library, Arcade, Canvas }

    private void NavLibrary_Click(object sender, RoutedEventArgs e) => ShowSection(Section.Library);
    private void NavArcade_Click(object sender, RoutedEventArgs e) => ShowSection(Section.Arcade);
    private async void NavCanvas_Click(object sender, RoutedEventArgs e)
    {
        ShowSection(Section.Canvas);
        // Already installed? Boot it straight away; otherwise the tab shows the
        // download offer and nothing is fetched until the user asks for it.
        if (!_canvasLoaded && CanvasService.InstalledVersion() is not null)
            await LoadCanvasWebAsync();
    }

    private void ShowSection(Section s)
    {
        NavLibrary.Tag = s == Section.Library ? "selected" : null;
        NavArcade.Tag = s == Section.Arcade ? "selected" : null;
        NavCanvas.Tag = s == Section.Canvas ? "selected" : null;
        LibraryView.Visibility = s == Section.Library ? Visibility.Visible : Visibility.Collapsed;
        ArcadeView.Visibility = s == Section.Arcade ? Visibility.Visible : Visibility.Collapsed;
        CanvasView.Visibility = s == Section.Canvas ? Visibility.Visible : Visibility.Collapsed;

        if (s == Section.Canvas) return; // Canvas hosts its own chrome; no entrance animation
        var panel = s == Section.Library ? (FrameworkElement)LibraryContent : ArcadeContent;
        if (Resources["FadeUp"] is Storyboard sb)
            sb.Begin(panel);
    }

    // ── Aelix Canvas: optional module, downloaded on demand ──
    // Manifest (canvas.json in the catalog repo) → allowlisted, SHA-256-verified
    // zip from a Labz365 GitHub release → %LOCALAPPDATA%\AelixStudio\Canvas.
    // Users who never open the tab download nothing.

    private async void CanvasAction_Click(object sender, RoutedEventArgs e)
    {
        if (_canvasBusy) return;
        _canvasBusy = true;
        CanvasActionBtn.IsEnabled = false;
        try
        {
            using var svc = new CanvasService();
            CanvasStatus.Text = "Fetching download info…";
            var manifest = await svc.GetManifestAsync();

            var progress = new Progress<DownloadProgress>(p =>
                CanvasStatus.Text = p.Percent is double pct
                    ? $"Downloading Canvas v{manifest.Version}… {pct:0}%"
                    : $"Downloading Canvas v{manifest.Version}…");
            await svc.InstallAsync(manifest, progress);

            CanvasStatus.Text = "Verified. Starting Canvas…";
            await LoadCanvasWebAsync();
        }
        catch (Exception ex)
        {
            CanvasStatus.Text = ex.Message;
            CanvasActionBtn.Content = "Retry download";
            CanvasActionBtn.IsEnabled = true;
        }
        finally
        {
            _canvasBusy = false;
        }
    }

    private async Task LoadCanvasWebAsync()
    {
        try
        {
            CanvasActionBtn.Visibility = Visibility.Collapsed;
            CanvasStatus.Text = "Starting Canvas…";

            var dataDir = Path.Combine(LauncherConfig.RootDataDir, "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir);
            await CanvasWeb.EnsureCoreWebView2Async(env);

            CanvasWeb.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "canvas.aelix", LauncherConfig.CanvasDir, CoreWebView2HostResourceAccessKind.Allow);
            CanvasWeb.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            CanvasWeb.CoreWebView2.Settings.IsStatusBarEnabled = false;
            CanvasWeb.Source = new Uri("https://canvas.aelix/index.html");

            CanvasFallback.Visibility = Visibility.Collapsed;
            CanvasWeb.Visibility = Visibility.Visible;
            _canvasLoaded = true;
        }
        catch (Exception ex)
        {
            CanvasStatus.Text = $"Couldn't start Canvas: {ex.Message}\n\nThe WebView2 runtime may be missing (preinstalled on Win11): https://developer.microsoft.com/microsoft-edge/webview2/";
            CanvasActionBtn.Content = "Try again";
            CanvasActionBtn.Visibility = Visibility.Visible;
            CanvasActionBtn.IsEnabled = true;
        }
    }

    // ── hero entrance: staggered fade-up, like the site ──
    private void PlayHeroEntrance()
    {
        Stagger(HeroEyebrow, 0.10);
        Stagger(HeroTitleA, 0.30);
        Stagger(HeroTitleB, 0.45);
        Stagger(HeroDesc, 0.70);
    }

    private static void Stagger(FrameworkElement el, double delaySeconds)
    {
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var begin = TimeSpan.FromSeconds(delaySeconds);
        var duration = TimeSpan.FromSeconds(0.9);

        var fade = new DoubleAnimation(0, 1, duration) { BeginTime = begin, EasingFunction = ease };
        el.BeginAnimation(OpacityProperty, fade);

        if (el.RenderTransform is TranslateTransform tt)
        {
            var rise = new DoubleAnimation(24, 0, duration) { BeginTime = begin, EasingFunction = ease };
            tt.BeginAnimation(TranslateTransform.YProperty, rise);
        }
    }
}
