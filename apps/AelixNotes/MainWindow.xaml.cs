using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace AelixNotes;

public partial class MainWindow : Window
{
    private static readonly string NotesDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AelixStudio", "Notes");
    private static readonly string NotesFile = Path.Combine(NotesDir, "notes.txt");

    private readonly DispatcherTimer _saveDebounce = new() { Interval = TimeSpan.FromSeconds(1.5) };
    private bool _loaded;

    public MainWindow()
    {
        InitializeComponent();
        _saveDebounce.Tick += (_, _) => { _saveDebounce.Stop(); Save(); };
        Loaded += (_, _) => LoadNote();
        Closing += (_, _) => Save();
    }

    private void LoadNote()
    {
        try
        {
            if (File.Exists(NotesFile))
                Editor.Text = File.ReadAllText(NotesFile);
        }
        catch (IOException) { /* start empty */ }
        _loaded = true;
        Editor.CaretIndex = Editor.Text.Length;
        Editor.Focus();
        UpdateCount();
        StatusText.Text = "SAVED";
    }

    private void Save()
    {
        if (!_loaded) return;
        try
        {
            Directory.CreateDirectory(NotesDir);
            File.WriteAllText(NotesFile, Editor.Text);
            StatusText.Text = "SAVED";
        }
        catch (IOException)
        {
            StatusText.Text = "COULD NOT SAVE";
        }
    }

    private void Editor_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (!_loaded) return;
        StatusText.Text = "…";
        UpdateCount();
        _saveDebounce.Stop();
        _saveDebounce.Start();
    }

    private void UpdateCount()
    {
        var words = Editor.Text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
        CountText.Text = $"{words} WORDS";
    }
}
