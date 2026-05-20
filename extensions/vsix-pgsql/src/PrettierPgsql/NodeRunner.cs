using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;

namespace PickyCode.PrettierPgsql;

/// <summary>
/// Finds a Node.js executable and runs the bundled format.mjs shim.
/// Node.js must be available — either on the system PATH or via Visual Studio's
/// own bundled runtime. Prettier and prettier-plugin-tsql are bundled inside the
/// extension so no npm install or project setup is needed by the user.
/// </summary>
internal static class NodeRunner {
    /// <summary>
    /// Formats the given SQL using the bundled prettier-plugin-tsql.
    /// </summary>
    /// <param name="sql">Raw SQL text.</param>
    /// <param name="optionsJson">Optional JSON string of Prettier options to override defaults.</param>
    /// <param name="filePath">Optional path to the SQL file, used to resolve a .prettierrc config.</param>
    /// <returns>Formatted SQL, or throws <see cref="FormattingException"/> on error.</returns>
    public static async Task<string> FormatAsync(string sql, string? optionsJson = null, string? filePath = null) {
        var node = FindNode();
        var script = BundledScriptPath();

        string args;
        if (filePath != null) {
            var opts = EscapeArg(optionsJson ?? "{}");
            args = $"\"{script}\" \"{opts}\" \"{EscapeArg(filePath)}\"";
        } else if (optionsJson != null) {
            args = $"\"{script}\" \"{EscapeArg(optionsJson)}\"";
        } else {
            args = $"\"{script}\"";
        }

        var psi = new ProcessStartInfo(node, args) {
            RedirectStandardInput  = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };

        using var process = Process.Start(psi)
            ?? throw new FormattingException("Failed to start node process.");

        await process.StandardInput.WriteAsync(sql);
        process.StandardInput.Close();

        var stdout = await process.StandardOutput.ReadToEndAsync();
        var stderr = await process.StandardError.ReadToEndAsync();
        await Task.Run(() => process.WaitForExit());

        if (process.ExitCode != 0)
            throw new FormattingException(
                string.IsNullOrWhiteSpace(stderr) ? "Formatting failed." : stderr.Trim());

        return stdout;
    }

    // -------------------------------------------------------------------------

    private static string BundledScriptPath() {
        var extensionDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
            ?? AppDomain.CurrentDomain.BaseDirectory;
        var script = Path.Combine(extensionDir, "bundled", "format.mjs");

        if (!File.Exists(script))
            throw new FormattingException(
                $"Bundled formatter not found at: {script}\n" +
                "Try reinstalling the extension.");

        return script;
    }

    /// <summary>
    /// Resolves the node executable. Preference order:
    ///   1. node.exe on the system PATH
    ///   2. Node.js bundled with Visual Studio (varies by install)
    /// </summary>
    private static string FindNode() {
        if (TryFindOnPath("node", out var fromPath))
            return fromPath!;

        foreach (var candidate in VisualStudioNodePaths())
            if (File.Exists(candidate))
                return candidate;

        throw new FormattingException(
            "Node.js was not found. Install Node.js 20+ from https://nodejs.org " +
            "or ensure it is on your PATH.");
    }

    private static bool TryFindOnPath(string exe, out string? fullPath) {
        try {
            var psi = new ProcessStartInfo(exe, "--version") {
                RedirectStandardOutput = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(2000);
            fullPath = exe;
            return p?.ExitCode == 0;
        } catch {
            fullPath = null;
            return false;
        }
    }

    /// <summary>
    /// Common locations where Visual Studio installs its bundled Node.js.
    /// </summary>
    private static IEnumerable<string> VisualStudioNodePaths() {
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var editions = new[] { "Enterprise", "Professional", "Community", "BuildTools", "Preview" };
        var vsVersions = new[] { "2026", "2022" };

        foreach (var ver in vsVersions)
            foreach (var ed in editions)
                yield return Path.Combine(
                    programFiles,
                    "Microsoft Visual Studio", ver, ed,
                    "MSBuild", "Microsoft", "VisualStudio", "NodeJs", "node.exe");
    }

    private static string EscapeArg(string s) =>
        s.Replace("\\", "\\\\").Replace("\"", "\\\"");
}

public class FormattingException : Exception {
    public FormattingException(string message) : base(message) { }
}
