using System;
using System.ComponentModel.Design;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Text;
using Microsoft.VisualStudio.Text.Editor;
using Microsoft.VisualStudio.TextManager.Interop;
using Task = System.Threading.Tasks.Task;

namespace PickyCode.PrettierTsql;

/// <summary>
/// "Format SQL (Prettier)" command — triggered by Ctrl+K, Ctrl+J.
/// Reads the active document, formats via NodeRunner, replaces the content.
/// </summary>
internal sealed class FormatCommand {
    private static readonly Guid CommandSetGuid = new Guid("11BF6762-35E0-4573-8672-1DDEDAB35E85");
    private const int CommandId = 0x0100;

    private readonly AsyncPackage _package;

    private FormatCommand(AsyncPackage package, OleMenuCommandService commandService) {
        _package = package;
        var menuCommandId = new CommandID(CommandSetGuid, CommandId);
        var menuItem = new OleMenuCommand(Execute, menuCommandId);
        menuItem.BeforeQueryStatus += OnBeforeQueryStatus;
        commandService.AddCommand(menuItem);
    }

    public static async Task InitializeAsync(AsyncPackage package) {
        await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
        var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService;
        if (commandService != null)
            new FormatCommand(package, commandService);
    }

    // Only enable the command when a SQL document is active
    private void OnBeforeQueryStatus(object sender, EventArgs e) {
        ThreadHelper.ThrowIfNotOnUIThread();
        if (sender is OleMenuCommand cmd)
            cmd.Enabled = GetActiveTextView() != null && GetActiveSqlFilePath() != null;
    }

    private async void Execute(object sender, EventArgs e) {
        await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();

        var textView = GetActiveTextView();
        if (textView == null) return;

        var snapshot = textView.TextBuffer.CurrentSnapshot;
        var sql = snapshot.GetText();
        if (string.IsNullOrWhiteSpace(sql)) return;

        var filePath = GetActiveSqlFilePath();

        string formatted;
        try {
            formatted = await NodeRunner.FormatAsync(sql, filePath: filePath);
        } catch (FormattingException ex) {
            ShowError(ex.Message);
            return;
        } catch (Exception ex) {
            ShowError($"Unexpected error: {ex.Message}");
            return;
        }

        await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
        using var edit = textView.TextBuffer.CreateEdit();
        edit.Replace(new Span(0, snapshot.Length), formatted);
        edit.Apply();
    }

    // -------------------------------------------------------------------------

    private static IWpfTextView? GetActiveTextView() {
        ThreadHelper.ThrowIfNotOnUIThread();
        var textManager = ServiceProvider.GlobalProvider.GetService(typeof(SVsTextManager)) as IVsTextManager2;
        if (textManager == null) return null;

        textManager.GetActiveView2(1, null, (uint)_VIEWFRAMETYPE.vftCodeWindow, out var vsView);
        if (vsView == null) return null;

        var userData = vsView as IVsUserData;
        if (userData == null) return null;

        var guidViewHost = Microsoft.VisualStudio.Editor.DefGuidList.guidIWpfTextViewHost;
        userData.GetData(ref guidViewHost, out var viewHostObj);
        return (viewHostObj as IWpfTextViewHost)?.TextView;
    }

    private static string? GetActiveSqlFilePath() {
        ThreadHelper.ThrowIfNotOnUIThread();
        var monitorSelection = ServiceProvider.GlobalProvider.GetService(typeof(SVsShellMonitorSelection))
            as IVsMonitorSelection;
        if (monitorSelection == null) return null;

        monitorSelection.GetCurrentElementValue(
            (uint)VSConstants.VSSELELEMID.SEID_DocumentFrame, out var frameObj);

        if (frameObj is IVsWindowFrame frame) {
            frame.GetProperty((int)__VSFPROPID.VSFPROPID_pszMkDocument, out var docPath);
            if (docPath is string path &&
                (path.EndsWith(".sql", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".tsql", StringComparison.OrdinalIgnoreCase)))
                return path;
        }
        return null;
    }

    private void ShowError(string message) {
        ThreadHelper.ThrowIfNotOnUIThread();
        VsShellUtilities.ShowMessageBox(
            _package,
            message,
            "Prettier T-SQL",
            OLEMSGICON.OLEMSGICON_WARNING,
            OLEMSGBUTTON.OLEMSGBUTTON_OK,
            OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
    }
}
