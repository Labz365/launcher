using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace AelixLauncher.Games;

public partial class MemoryWindow : Window
{
    private static readonly string[] Glyphs = { "◆", "●", "▲", "■", "✦", "✚", "♥", "★" };

    private static readonly Brush Cream = new SolidColorBrush(Color.FromRgb(0xF2, 0xED, 0xE8));
    private static readonly Brush Sand = new SolidColorBrush(Color.FromRgb(0xDD, 0xD0, 0xC4));
    private static readonly Brush CellBg = new SolidColorBrush(Color.FromRgb(0x1F, 0x1F, 0x1F));
    private static readonly Brush Hairline = new SolidColorBrush(Color.FromArgb(0x1A, 0xF2, 0xED, 0xE8));

    private sealed class Card
    {
        public required string Glyph;
        public required Border Cell;
        public required TextBlock Face;
        public bool Revealed;
        public bool Matched;
    }

    private readonly Random _rng = new();
    private readonly DispatcherTimer _hideTimer = new() { Interval = TimeSpan.FromMilliseconds(750) };
    private readonly List<Card> _cards = new();
    private Card? _first;
    private bool _locked;
    private int _moves;
    private int _best = int.MaxValue;

    public MemoryWindow()
    {
        InitializeComponent();
        _hideTimer.Tick += (_, _) => HideUnmatched();
        Overlay.MouseLeftButtonDown += (_, _) => StartGame();
        KeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
    }

    private void StartGame()
    {
        Overlay.Visibility = Visibility.Collapsed;
        _moves = 0;
        _first = null;
        _locked = false;
        UpdateHud();

        var deck = Glyphs.Concat(Glyphs).OrderBy(_ => _rng.Next()).ToList();

        Board.Children.Clear();
        _cards.Clear();
        foreach (var glyph in deck)
        {
            var face = new TextBlock
            {
                Text = "·",
                FontSize = 30,
                Foreground = Hairline,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            var cell = new Border
            {
                Background = CellBg,
                BorderBrush = Hairline,
                BorderThickness = new Thickness(1),
                Margin = new Thickness(5),
                Child = face,
                Cursor = Cursors.Hand,
            };
            var card = new Card { Glyph = glyph, Cell = cell, Face = face };
            cell.MouseLeftButtonDown += (_, _) => Flip(card);
            _cards.Add(card);
            Board.Children.Add(cell);
        }
    }

    private void Flip(Card card)
    {
        if (_locked || card.Matched || card.Revealed) return;

        Reveal(card, true);

        if (_first is null)
        {
            _first = card;
            return;
        }

        _moves++;
        UpdateHud();

        if (_first.Glyph == card.Glyph)
        {
            card.Matched = _first.Matched = true;
            card.Face.Foreground = _first.Face.Foreground = Sand;
            card.Cell.BorderBrush = _first.Cell.BorderBrush = Sand;
            _first = null;
            if (_cards.All(c => c.Matched)) Win();
        }
        else
        {
            _locked = true;
            _hideTimer.Start();
        }
    }

    private void HideUnmatched()
    {
        _hideTimer.Stop();
        foreach (var c in _cards.Where(c => c.Revealed && !c.Matched))
            Reveal(c, false);
        _first = null;
        _locked = false;
    }

    private void Reveal(Card card, bool show)
    {
        card.Revealed = show;
        card.Face.Text = show ? card.Glyph : "·";
        card.Face.Foreground = show ? Cream : Hairline;
        card.Face.FontSize = show ? 30 : 30;
    }

    private void Win()
    {
        _best = Math.Min(_best, _moves);
        OverlayTitle.Text = "All matched.";
        OverlayHint.Text = $"MOVES {_moves:00} · BEST {_best:00} · CLICK TO PLAY AGAIN";
        Overlay.Visibility = Visibility.Visible;
        UpdateHud();
    }

    private void UpdateHud()
    {
        MovesText.Text = $"MOVES {_moves:00}";
        BestText.Text = _best == int.MaxValue ? "BEST —" : $"BEST {_best:00}";
    }
}
