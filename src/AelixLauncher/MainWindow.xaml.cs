using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using AelixLauncher.ViewModels;

namespace AelixLauncher;

public partial class MainWindow : Window
{
    private readonly MainViewModel _vm = new();

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
    private void NavLibrary_Click(object sender, RoutedEventArgs e) => ShowSection(library: true);
    private void NavArcade_Click(object sender, RoutedEventArgs e) => ShowSection(library: false);

    private void ShowSection(bool library)
    {
        NavLibrary.Tag = library ? "selected" : null;
        NavArcade.Tag = library ? null : "selected";
        LibraryView.Visibility = library ? Visibility.Visible : Visibility.Collapsed;
        ArcadeView.Visibility = library ? Visibility.Collapsed : Visibility.Visible;

        var panel = library ? (FrameworkElement)LibraryContent : ArcadeContent;
        if (Resources["FadeUp"] is Storyboard sb)
            sb.Begin(panel);
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
