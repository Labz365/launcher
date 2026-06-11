using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;

namespace AelixNotes;

public sealed class NotebookItem
{
    public required string Name { get; init; }
    public required string Dir { get; init; }
    public required int NoteCount { get; init; }
    public string CountLabel => NoteCount.ToString("00");
}

public sealed class NoteItem
{
    public required string Title { get; init; }
    public required string File { get; init; }
    public required string Preview { get; init; }
}

public partial class MainWindow : Window
{
    private static readonly string RootDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AelixStudio", "Notes");

    private readonly DispatcherTimer _saveDebounce = new() { Interval = TimeSpan.FromSeconds(1.2) };
    private string? _openFile;
    private bool _suppressTextEvents;

    public MainWindow()
    {
        InitializeComponent();
        // refreshList stays false here: rebuilding the lists mid-typing would steal the caret.
        // Previews/ordering refresh on the next notebook or note switch instead.
        _saveDebounce.Tick += (_, _) => { _saveDebounce.Stop(); SaveOpenNote(refreshList: false); };
        Closing += (_, _) => SaveOpenNote(refreshList: false);
        KeyDown += OnKeyDown;
        Loaded += (_, _) => Bootstrap();
    }

    // ───── startup & migration ─────

    private void Bootstrap()
    {
        Directory.CreateDirectory(RootDir);

        // v1.0 migration: a loose notes.txt becomes "My Notebook/Welcome.txt"
        var legacy = Path.Combine(RootDir, "notes.txt");
        if (File.Exists(legacy))
        {
            var dir = Path.Combine(RootDir, "My Notebook");
            Directory.CreateDirectory(dir);
            var target = UniquePath(Path.Combine(dir, "Welcome.txt"));
            File.Move(legacy, target);
        }

        if (!Directory.EnumerateDirectories(RootDir).Any())
            Directory.CreateDirectory(Path.Combine(RootDir, "My Notebook"));

        LoadNotebooks(selectName: null);
    }

    // ───── notebooks ─────

    private void LoadNotebooks(string? selectName)
    {
        var items = Directory.EnumerateDirectories(RootDir)
            .OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase)
            .Select(d => new NotebookItem
            {
                Name = Path.GetFileName(d),
                Dir = d,
                NoteCount = Directory.EnumerateFiles(d, "*.txt").Count(),
            })
            .ToList();

        NotebookList.ItemsSource = items;
        var pick = items.FirstOrDefault(n => n.Name == selectName) ?? items.FirstOrDefault();
        NotebookList.SelectedItem = pick;
    }

    private NotebookItem? CurrentNotebook => NotebookList.SelectedItem as NotebookItem;

    private void NotebookList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SaveOpenNote(refreshList: false);
        if (CurrentNotebook is { } nb)
        {
            NotesHeader.Text = "NOTES — " + nb.Name.ToUpperInvariant();
            LoadNotes(nb, selectFile: null);
        }
    }

    private void NewNotebook_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new NameDialog("New notebook", "Notebook") { Owner = this };
        if (dlg.ShowDialog() != true) return;
        var dir = UniquePath(Path.Combine(RootDir, Sanitize(dlg.Value)));
        Directory.CreateDirectory(dir);
        LoadNotebooks(Path.GetFileName(dir));
    }

    private void RenameNotebook_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as MenuItem)?.DataContext is not NotebookItem nb) return;
        var dlg = new NameDialog("Rename notebook", nb.Name) { Owner = this };
        if (dlg.ShowDialog() != true || dlg.Value == nb.Name) return;
        SaveOpenNote(refreshList: false);
        CloseEditor();
        var target = UniquePath(Path.Combine(RootDir, Sanitize(dlg.Value)));
        Directory.Move(nb.Dir, target);
        LoadNotebooks(Path.GetFileName(target));
    }

    private void DeleteNotebook_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as MenuItem)?.DataContext is not NotebookItem nb) return;
        var answer = MessageBox.Show(
            $"Delete \"{nb.Name}\" and the {nb.NoteCount} note(s) inside it?",
            "Aelix Notes", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (answer != MessageBoxResult.Yes) return;
        CloseEditor();
        Directory.Delete(nb.Dir, recursive: true);
        LoadNotebooks(selectName: null);
    }

    // ───── notes ─────

    private void LoadNotes(NotebookItem nb, string? selectFile)
    {
        var items = Directory.EnumerateFiles(nb.Dir, "*.txt")
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .Select(f => new NoteItem
            {
                Title = Path.GetFileNameWithoutExtension(f),
                File = f,
                Preview = ReadPreview(f),
            })
            .ToList();

        NoteList.ItemsSource = items;
        var pick = items.FirstOrDefault(n => n.File == selectFile) ?? items.FirstOrDefault();
        NoteList.SelectedItem = pick;
        if (pick is null) CloseEditor();
    }

    private static string ReadPreview(string file)
    {
        try
        {
            var line = File.ReadLines(file).FirstOrDefault(l => !string.IsNullOrWhiteSpace(l)) ?? "";
            line = line.Trim();
            var stamp = File.GetLastWriteTime(file).ToString("dd MMM yyyy").ToUpperInvariant();
            return line.Length == 0 ? stamp : $"{stamp} · {(line.Length > 34 ? line[..34] + "…" : line)}";
        }
        catch (IOException) { return ""; }
    }

    private void NoteList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SaveOpenNote(refreshList: false);
        if (NoteList.SelectedItem is not NoteItem note) return;

        _suppressTextEvents = true;
        try
        {
            Editor.Text = File.Exists(note.File) ? File.ReadAllText(note.File) : "";
        }
        catch (IOException)
        {
            Editor.Text = "";
        }
        _suppressTextEvents = false;

        _openFile = note.File;
        EditorTitle.Text = note.Title;
        Editor.IsEnabled = true;
        Editor.CaretIndex = Editor.Text.Length;
        StatusText.Text = "SAVED";
        UpdateCount();
    }

    private void NewNote_Click(object sender, RoutedEventArgs e)
    {
        if (CurrentNotebook is not { } nb) return;
        var dlg = new NameDialog("New note", "Untitled") { Owner = this };
        if (dlg.ShowDialog() != true) return;
        var file = UniquePath(Path.Combine(nb.Dir, Sanitize(dlg.Value) + ".txt"));
        File.WriteAllText(file, "");
        RefreshKeepingSelection(file);
        Editor.Focus();
    }

    private void RenameNote_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as MenuItem)?.DataContext is not NoteItem note || CurrentNotebook is not { } nb) return;
        var dlg = new NameDialog("Rename note", note.Title) { Owner = this };
        if (dlg.ShowDialog() != true || dlg.Value == note.Title) return;
        SaveOpenNote(refreshList: false);
        var target = UniquePath(Path.Combine(nb.Dir, Sanitize(dlg.Value) + ".txt"));
        if (_openFile == note.File) _openFile = null;
        File.Move(note.File, target);
        RefreshKeepingSelection(target);
    }

    private void DeleteNote_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as MenuItem)?.DataContext is not NoteItem note || CurrentNotebook is not { } nb) return;
        var answer = MessageBox.Show(
            $"Delete \"{note.Title}\"?",
            "Aelix Notes", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (answer != MessageBoxResult.Yes) return;
        if (_openFile == note.File) CloseEditor();
        File.Delete(note.File);
        RefreshKeepingSelection(selectFile: null);
    }

    /// <summary>Reload both panes without losing the current notebook.</summary>
    private void RefreshKeepingSelection(string? selectFile)
    {
        if (CurrentNotebook is not { } nb) return;
        var nbName = nb.Name;
        LoadNotebooks(nbName); // refreshes note counts; reselects → triggers LoadNotes
        if (selectFile is not null && CurrentNotebook is { } again)
            LoadNotes(again, selectFile);
    }

    // ───── editor ─────

    private void Editor_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressTextEvents || _openFile is null) return;
        StatusText.Text = "…";
        UpdateCount();
        _saveDebounce.Stop();
        _saveDebounce.Start();
    }

    private void SaveOpenNote(bool refreshList)
    {
        _saveDebounce.Stop();
        if (_openFile is null) return;
        try
        {
            File.WriteAllText(_openFile, Editor.Text);
            StatusText.Text = "SAVED";
        }
        catch (IOException)
        {
            StatusText.Text = "COULD NOT SAVE";
        }

        if (refreshList) RefreshKeepingSelection(_openFile);
    }

    private void CloseEditor()
    {
        _saveDebounce.Stop();
        _openFile = null;
        _suppressTextEvents = true;
        Editor.Text = "";
        _suppressTextEvents = false;
        Editor.IsEnabled = false;
        EditorTitle.Text = "";
        StatusText.Text = "";
        CountText.Text = "";
    }

    private void UpdateCount()
    {
        var words = Editor.Text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
        CountText.Text = $"{words} WORDS";
    }

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.N && Keyboard.Modifiers == ModifierKeys.Control)
        { NewNote_Click(this, new RoutedEventArgs()); e.Handled = true; }
        else if (e.Key == Key.N && Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
        { NewNotebook_Click(this, new RoutedEventArgs()); e.Handled = true; }
        else if (e.Key == Key.S && Keyboard.Modifiers == ModifierKeys.Control)
        { SaveOpenNote(refreshList: false); e.Handled = true; }
    }

    // ───── helpers ─────

    private static string Sanitize(string name)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '-');
        name = name.Trim().TrimEnd('.');
        return string.IsNullOrEmpty(name) ? "Untitled" : name;
    }

    /// <summary>Appends " 2", " 3", … until the path doesn't exist.</summary>
    private static string UniquePath(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path)!;
        var name = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (var i = 2; ; i++)
        {
            var candidate = Path.Combine(dir, $"{name} {i}{ext}");
            if (!File.Exists(candidate) && !Directory.Exists(candidate)) return candidate;
        }
    }
}
