using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace AelixLauncher.Games;

public partial class ReflexWindow : Window
{
    private const double FieldSize = 440;
    private const double GameSeconds = 30.0;

    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private readonly Random _rng = new();
    private DateTime _endsAt;
    private int _hits;
    private int _best;
    private bool _running;
    private Ellipse? _target;

    public ReflexWindow()
    {
        InitializeComponent();
        _clock.Tick += (_, _) => Tick();
        Overlay.MouseLeftButtonDown += (_, _) => StartGame();
        KeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
        // missing a target costs nothing, but clicking the field does not score
        Field.MouseLeftButtonDown += (_, _) => { /* miss */ };
    }

    private void StartGame()
    {
        _hits = 0;
        _running = true;
        _endsAt = DateTime.UtcNow.AddSeconds(GameSeconds);
        Overlay.Visibility = Visibility.Collapsed;
        UpdateHud();
        _clock.Start();
        SpawnTarget();
    }

    private void EndGame()
    {
        _running = false;
        _clock.Stop();
        Field.Children.Clear();
        _target = null;
        _best = Math.Max(_best, _hits);
        OverlayTitle.Text = _hits >= _best && _hits > 0 ? "Sharp." : "Time.";
        OverlayHint.Text = $"HITS {_hits:000} · BEST {_best:000} · CLICK TO RETRY";
        Overlay.Visibility = Visibility.Visible;
        UpdateHud();
    }

    private void Tick()
    {
        var left = (_endsAt - DateTime.UtcNow).TotalSeconds;
        if (left <= 0) { EndGame(); return; }
        TimeText.Text = $"TIME {left:0.0}";
    }

    private void SpawnTarget()
    {
        if (!_running) return;
        Field.Children.Clear();

        // targets shrink as you score: 64px down to 26px
        var size = Math.Max(26, 64 - _hits * 2);
        var x = _rng.Next(8, (int)(FieldSize - size - 8));
        var y = _rng.Next(8, (int)(FieldSize - size - 8));

        var ring = new Ellipse
        {
            Width = size,
            Height = size,
            Stroke = new SolidColorBrush(Color.FromRgb(0xDD, 0xD0, 0xC4)),
            StrokeThickness = 1.5,
            Fill = new SolidColorBrush(Color.FromArgb(0x33, 0xDD, 0xD0, 0xC4)),
            Cursor = Cursors.Hand,
        };
        System.Windows.Controls.Canvas.SetLeft(ring, x);
        System.Windows.Controls.Canvas.SetTop(ring, y);

        ring.MouseLeftButtonDown += (_, e) =>
        {
            e.Handled = true;
            if (!_running) return;
            _hits++;
            UpdateHud();
            SpawnTarget();
        };

        // fade away; if it fully fades, respawn somewhere else (no penalty)
        var lifetime = Math.Max(0.9, 2.2 - _hits * 0.05);
        var fade = new DoubleAnimation(1, 0, TimeSpan.FromSeconds(lifetime)) { BeginTime = TimeSpan.FromSeconds(0.15) };
        fade.Completed += (_, _) => { if (_running && _target == ring) SpawnTarget(); };
        _target = ring;
        Field.Children.Add(ring);
        ring.BeginAnimation(OpacityProperty, fade);
    }

    private void UpdateHud()
    {
        ScoreText.Text = $"HITS {_hits:000}";
    }
}
