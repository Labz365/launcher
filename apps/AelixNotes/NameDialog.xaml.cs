using System.Windows;
using System.Windows.Input;

namespace AelixNotes;

public partial class NameDialog : Window
{
    public string Value => NameBox.Text.Trim();

    public NameDialog(string prompt, string initial = "")
    {
        InitializeComponent();
        PromptText.Text = prompt.ToUpperInvariant();
        NameBox.Text = initial;
        Loaded += (_, _) => { NameBox.Focus(); NameBox.SelectAll(); };
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        if (Value.Length == 0) return;
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void NameBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && Value.Length > 0) DialogResult = true;
        if (e.Key == Key.Escape) DialogResult = false;
    }
}
