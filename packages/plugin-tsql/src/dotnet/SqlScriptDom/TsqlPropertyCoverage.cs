using System.Reflection;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace PrettierTsql;

/// <summary>
/// The ScriptDom properties AstBuilder never reads (see PrettierSql.Core.PropertyCoverage):
/// every public property of a concrete fragment type, without source positions.
/// </summary>
internal static class TsqlPropertyCoverage {
    // Where something was written, not what it means — the same list Canonical ignores
    private static readonly HashSet<string> PositionProperties = new() {
        "StartOffset", "FragmentLength", "StartLine", "StartColumn",
        "FirstTokenIndex", "LastTokenIndex", "ScriptTokenStream",
    };

    public static string[] UnreadProperties() => PrettierSql.Core.PropertyCoverage.Unread(
        typeof(AstBuilder),
        typeof(TSqlFragment).Assembly.GetExportedTypes().Where(t => !t.IsAbstract && typeof(TSqlFragment).IsAssignableFrom(t)),
        t => t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.GetIndexParameters().Length == 0 && !PositionProperties.Contains(p.Name)));
}
