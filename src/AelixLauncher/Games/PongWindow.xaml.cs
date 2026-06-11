using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace AelixLauncher.Games;

public partial class PongWindow : Window
{
    private const double W = 440, H = 440;
    private const double PaddleH = 78, PaddleW = 9, BallSize = 11;
    private const int WinScore = 7;

    private static readonly Brush Cream = new SolidColorBrush(Color.FromRgb(0xF2, 0xED, 0xE8));
    private static readonly Brush Sand = new SolidColorBrush(Color.FromRgb(0xDD, 0xD0, 0xC4));

    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly Random _rng = new();

    private readonly Rectangle _player = new() { Width = PaddleW, Height = PaddleH, Fill = null };
    private readonly Rectangle _ai = new() { Width = PaddleW, Height = PaddleH, Fill = null };
    private readonly Ellipse _ball = new() { Width = BallSize, Height = BallSize, Fill = null };

    private double _playerY = (H - PaddleH) / 2, _aiY = (H - PaddleH) / 2;
    private double _ballX, _ballY, _vx, _vy;
    private int _playerScore, _aiScore;
    private bool _rallying;
    private double _keyDir; // -1 up, +1 down, 0 none

    public PongWindow()
    {
        InitializeComponent();
        _player.Fill = Cream;
        _ai.Fill = Sand;
        _ball.Fill = Cream;
        Court.Children.Add(_player);
        Court.Children.Add(_ai);
        Court.Children.Add(_ball);

        _timer.Tick += (_, _) => Step();
        KeyDown += OnKeyDown;
        KeyUp += (_, e) => { if (e.Key is Key.W or Key.S or Key.Up or Key.Down) _keyDir = 0; };
        Court.MouseMove += (_, e) =>
        {
            var y = e.GetPosition(Court).Y - PaddleH / 2;
            _playerY = Math.Clamp(y, 0, H - PaddleH);
        };
        Loaded += (_, _) => { ResetPositions(serve: false); Render(); Focus(); };
    }

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Escape: Close(); return;
            case Key.Space:
                if (!_rallying)
                {
                    if (_playerScore >= WinScore || _aiScore >= WinScore)
                    { _playerScore = 0; _aiScore = 0; UpdateScore(); }
                    Serve();
                }
                return;
            case Key.W or Key.Up: _keyDir = -1; return;
            case Key.S or Key.Down: _keyDir = 1; return;
        }
    }

    private void Serve()
    {
        ResetPositions(serve: true);
        Overlay.Visibility = Visibility.Collapsed;
        _rallying = true;
        _timer.Start();
    }

    private void ResetPositions(bool serve)
    {
        _ballX = (W - BallSize) / 2;
        _ballY = (H - BallSize) / 2;
        if (serve)
        {
            _vx = (_rng.Next(2) == 0 ? -1 : 1) * 4.6;
            _vy = (_rng.NextDouble() * 2 - 1) * 3.2;
        }
    }

    private void Step()
    {
        // player keyboard movement
        if (_keyDir != 0)
            _playerY = Math.Clamp(_playerY + _keyDir * 6.4, 0, H - PaddleH);

        // AI follows with limited speed (beatable)
        var target = _ballY + BallSize / 2 - PaddleH / 2;
        var step = Math.Clamp(target - _aiY, -4.4, 4.4);
        _aiY = Math.Clamp(_aiY + step, 0, H - PaddleH);

        _ballX += _vx;
        _ballY += _vy;

        // top/bottom walls
        if (_ballY <= 0) { _ballY = 0; _vy = Math.Abs(_vy); }
        if (_ballY >= H - BallSize) { _ballY = H - BallSize; _vy = -Math.Abs(_vy); }

        // player paddle (x: 14)
        if (_vx < 0 && _ballX <= 14 + PaddleW && _ballX >= 14 &&
            _ballY + BallSize >= _playerY && _ballY <= _playerY + PaddleH)
        {
            Bounce(_playerY);
            _vx = Math.Abs(_vx);
        }

        // AI paddle (x: W-14-PaddleW)
        if (_vx > 0 && _ballX + BallSize >= W - 14 - PaddleW && _ballX + BallSize <= W - 14 &&
            _ballY + BallSize >= _aiY && _ballY <= _aiY + PaddleH)
        {
            Bounce(_aiY);
            _vx = -Math.Abs(_vx);
        }

        // out of bounds
        if (_ballX < -BallSize) { _aiScore++; EndRally(); return; }
        if (_ballX > W) { _playerScore++; EndRally(); return; }

        Render();
    }

    private void Bounce(double paddleY)
    {
        // angle depends on where the ball hits the paddle; slight speed-up each hit
        var rel = (_ballY + BallSize / 2 - paddleY) / PaddleH - 0.5; // -0.5 .. 0.5
        _vy = rel * 9.0;
        var speed = Math.Min(Math.Abs(_vx) * 1.045, 10.5);
        _vx = Math.Sign(_vx) * speed;
    }

    private void EndRally()
    {
        _rallying = false;
        _timer.Stop();
        UpdateScore();

        if (_playerScore >= WinScore || _aiScore >= WinScore)
        {
            OverlayTitle.Text = _playerScore > _aiScore ? "Yours." : "Theirs.";
            OverlayHint.Text = $"YOU {_playerScore} — {_aiScore} AEL · SPACE FOR A NEW MATCH";
        }
        else
        {
            OverlayTitle.Text = _playerScore > _aiScore ? "Point." : "Point them.";
            OverlayHint.Text = "PRESS SPACE TO SERVE";
        }
        Overlay.Visibility = Visibility.Visible;
        ResetPositions(serve: false);
        Render();
    }

    private void UpdateScore() => ScoreText.Text = $"YOU {_playerScore} — {_aiScore} AEL";

    private void Render()
    {
        System.Windows.Controls.Canvas.SetLeft(_player, 14);
        System.Windows.Controls.Canvas.SetTop(_player, _playerY);
        System.Windows.Controls.Canvas.SetLeft(_ai, W - 14 - PaddleW);
        System.Windows.Controls.Canvas.SetTop(_ai, _aiY);
        System.Windows.Controls.Canvas.SetLeft(_ball, _ballX);
        System.Windows.Controls.Canvas.SetTop(_ball, _ballY);
    }
}
