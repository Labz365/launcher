using System.Windows;

namespace AelixLauncher;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Last-resort handler: show a friendly message instead of crashing.
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                "Something went wrong:\n\n" + args.Exception.Message,
                "Aelix Studio Launcher", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
    }
}
