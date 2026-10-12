using System.Reflection;
using System.Runtime.InteropServices;

namespace PrettierPgsql;

/// <summary>
/// Finds libpg_query for the platform the plugin runs on. pgsqlparser ships one build per
/// platform under runtimes/&lt;rid&gt;/native/, but an assembly that node-api-dotnet loads gets no
/// deps.json-driven native probing: DllImport only looks beside the assembly, where the build
/// copies the library of the machine it ran on. A package built on Linux then failed on macOS
/// and Windows with "Unable to load shared library 'libpg_query'".
/// </summary>
internal static class NativeLibraries {
    private const string LibraryName = "libpg_query";
    private static int _registered;

    /// <summary>Points pgsqlparser's DllImports at the right native library. Safe to call often.</summary>
    public static void Register() {
        if (Interlocked.Exchange(ref _registered, 1) == 1) return;
        try {
            NativeLibrary.SetDllImportResolver(typeof(PgSqlParser.Parser).Assembly, Resolve);
        } catch (InvalidOperationException) {
            // pgsqlparser has a resolver of its own: leave the loading to it
        }
    }

    private static IntPtr Resolve(string name, Assembly assembly, DllImportSearchPath? searchPath) {
        if (name != LibraryName) return IntPtr.Zero;
        var dir = Path.GetDirectoryName(typeof(NativeLibraries).Assembly.Location);
        if (string.IsNullOrEmpty(dir)) return IntPtr.Zero;

        var (rid, file) = Platform();
        if (rid == null) {
            throw new PlatformNotSupportedException(
                $"prettier-plugin-postgresql has no libpg_query for {RuntimeInformation.OSDescription} " +
                $"({RuntimeInformation.ProcessArchitecture}); it supports Linux x64, macOS x64 and arm64, and Windows x64.");
        }
        // The platform's own build first, then the copy the build puts beside the assembly
        foreach (var path in new[] { Path.Combine(dir, "runtimes", rid, "native", file), Path.Combine(dir, file) }) {
            if (File.Exists(path) && NativeLibrary.TryLoad(path, out var handle)) return handle;
        }
        return IntPtr.Zero; // the default probing, and its error message
    }

    /// <summary>The runtime identifier pgsqlparser has a build for, and the library's file name.</summary>
    private static (string? Rid, string File) Platform() {
        var arch = RuntimeInformation.ProcessArchitecture;
        if (OperatingSystem.IsMacOS())
            return (arch switch { Architecture.Arm64 => "osx-arm64", Architecture.X64 => "osx-x64", _ => null }, "libpg_query.dylib");
        if (OperatingSystem.IsWindows())
            return (arch == Architecture.X64 ? "win-x64" : null, "libpg_query.dll");
        if (OperatingSystem.IsLinux())
            return (arch == Architecture.X64 ? "linux-x64" : null, "libpg_query.so");
        return (null, "libpg_query");
    }
}
