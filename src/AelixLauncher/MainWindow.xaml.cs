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
            sb.B