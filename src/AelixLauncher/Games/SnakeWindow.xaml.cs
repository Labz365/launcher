using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace AelixLauncher.Games;

public partial class SnakeWindow : Window
{
    private const int Cells = 20;          // 20×20 grid
    private const double CellSize = 22;    // 440 / 20

    private static readonly Brush SnakeBrush = new SolidColorBrush(Color.FromRgb(0xF2, 0xED, 0xE8));
    private static readonly Brush HeadBrush = new SolidColorBrush(Color.FromRgb(0xDD, 0xD0, 0xC4));
    private static readonly Brush FoodBrush = new SolidColorBrush(Color.FromRgb(0xDD, 0xD0, 0xC4));

    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(130) };
    private readonly Random _rng = new();
    private readonly List<(int X, int Y)> _snake = new();
    private (int X, int Y) _dir = (1, 0);
    private (int X, int Y) _pendingDir = (1, 0);
    private (int X, int Y) _food;
    private int _score;
    private int _best;
    private bool _running;

    public SnakeWindow()
    {
        InitializeComponent();
        _timer.Tick += (_, _) => Step();
        KeyDown += OnKeyDown;
        Loaded += (_, _) => Focus();
    }

    private void StartGame()
    {
        _snake.Clear();
        _snake.Add((5, 10));
        _snake.Add((4, 10));
        _snake.Add((3, 10));
        _dir = _pendingDir = (1, 0);
        _score = 0;
        SpawnFood();
        UpdateScore();
        Overlay.Visibility = Visibility.Collapsed;
        _running = true;
        _timer.Start();
        Render();
    }

    private void GameOver()
    {
        _running = false;
        _timer.Stop();
        _best = Math.Max(_best, _score);
        UpdateScore();
        OverlayTitle.Text = "Folded.";
        OverlayHint.Text = $"SCORE {_score:000} · SPACE TO RETRY";
        Overlay.Visibility = Visibility.Visible;
    }

    private void Step()
    {
        _dir = _pendingDir;
        var head = (_snake[0].X + _dir.X, _snake[0].Y + _dir.Y);

        // walls + self = game over
        if (head.Item1 < 0 || head.Item1 >= Cells || head.Item2 < 0 || head.Item2 >= Cells ||
            _snake.Contains(head))
        {
            GameOver();
            return;
        }

        _snake.Insert(0, head);
        if (head == _food)
        {
            _score++;
            UpdateScore();
            SpawnFood();
            // speed up slightly, floor at 70ms
            var ms = Math.Max(70, 130 - _score * 3);
            _timer.Interval = TimeSpan.FromMilliseconds(ms);
        }
        else
        {
            _snake.RemoveAt(_snake.Count - 1);
        }
        Render();
    }

    private void SpawnFood()
    {
        do
        {
            _food = (_rng.Next(Cells), _rng.Next(Cells));
        } while (_snake.Contains(_food));
    }

    private void Render()
    {
        Board.Children.Clear();

        // food: small accent diamond
        var food = new Rectangle
        {
            Width = CellSize - 8,
            Height = CellSize - 8,
            Fill = FoodBrush,
            RenderTransformOrigin = new Point(0.5, 0.5),
            RenderTransform = new RotateTransform(45),
        };
        System.Windows.Controls.Canvas.SetLeft(food, _food.X * CellSize + 4);
        System.Windows.Controls.Canvas.SetTop(food, _food.Y * CellSize + 4);
        Board.Children.Add(food);

        for (var i = 0; i < _snake.Count; i++)
        {
            var seg = new Rectangle
            {
                Width = CellSize - 2,
                Height = CellSize - 2,
                Fill = i == 0 ? HeadBrush : SnakeBrush,
                Opacity = i == 0 ? 1.0 : Math.Max(0.35, 1.0 - i * 0.05),
            };
            System.Windows.Controls.Canvas.SetLeft(seg, _snake[i].X * CellSize + 1);
            System.Windows.Controls.Canvas.SetTop(seg, _snake[i].Y * CellSize + 1);
            Board.Children.Add(seg);
        }
    }

    private void UpdateScore()
    {
        ScoreText.Text = $"SCORE {_score:000}";
        BestText.Text = $"BEST {_best:000}";
    }

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Escape: Close(); return;
            case Key.Space:
                if (!_running) StartGame();
                return;
        }
        if (!_running) return;

        var d = e.Key switch
        {
            Key.Up or Key.W => (0, -1),
            Key.Down or Key.S => (0, 1),
            Key.Left or Key.A => (-1, 0),
            Key.Right or Key.D => (1, 0),
            _ => _pendingDir,
        };
        // no instant 180° turns
        if (d.Item1 != -_dir.X || d.Item2 != -_dir.Y)
            _pendingDir = d;
    }
}
