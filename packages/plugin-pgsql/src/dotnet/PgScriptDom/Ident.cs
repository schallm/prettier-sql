namespace PrettierPgsql;

/// <summary>
/// Re-quotes identifiers for output. libpg_query hands us each identifier's real
/// value — unquoted names already case-folded to lowercase, quoted ones verbatim —
/// so an identifier has to be written back with double quotes whenever it wouldn't
/// survive re-parsing unquoted. Mirrors PostgreSQL's quote_ident(): quote unless the
/// name is all lowercase letters, digits, underscores and dollars (not starting with
/// a digit or dollar) and isn't a keyword that can't stand as a bare identifier.
/// </summary>
public static class Ident {
    // RESERVED_KEYWORD entries from PostgreSQL's kwlist.h: never usable as a bare
    // identifier (except as a column label after AS, where quoting is still harmless).
    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal) {
        "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
        "both", "case", "cast", "check", "collate", "column", "constraint", "create",
        "current_catalog", "current_date", "current_role", "current_time",
        "current_timestamp", "current_user", "default", "deferrable", "desc", "distinct",
        "do", "else", "end", "except", "false", "fetch", "for", "foreign", "from", "grant",
        "group", "having", "in", "initially", "intersect", "into", "lateral", "leading",
        "limit", "localtime", "localtimestamp", "not", "null", "offset", "on", "only", "or",
        "order", "placing", "primary", "references", "returning", "select", "session_user",
        "some", "symmetric", "system_user", "table", "then", "to", "trailing", "true",
        "union", "unique", "user", "using", "variadic", "when", "where", "window", "with",
    };

    // TYPE_FUNC_NAME_KEYWORD entries: usable bare as a function or type name, but
    // not as a column, table or other name.
    private static readonly HashSet<string> TypeFuncName = new(StringComparer.Ordinal) {
        "authorization", "binary", "collation", "concurrently", "cross", "current_schema",
        "freeze", "full", "ilike", "inner", "is", "isnull", "join", "left", "like", "natural",
        "notnull", "outer", "overlaps", "right", "similar", "tablesample", "verbose",
    };

    private static bool IsSafeBare(string name) {
        if (name.Length == 0 || !(name[0] is (>= 'a' and <= 'z') or '_')) return false;
        foreach (var c in name) {
            if (!(c is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '_' or '$')) return false;
        }
        return true;
    }

    /// <summary>Quotes a single identifier if it can't be written bare.</summary>
    public static string Quote(string name) =>
        IsSafeBare(name) && !Reserved.Contains(name) && !TypeFuncName.Contains(name)
            ? name
            : "\"" + name.Replace("\"", "\"\"") + "\"";

    /// <summary>
    /// Quotes a function or type name part: TYPE_FUNC_NAME keywords such as
    /// <c>left</c> are valid bare in that position, so they stay unquoted.
    /// </summary>
    public static string QuoteFunc(string name) =>
        IsSafeBare(name) && !Reserved.Contains(name)
            ? name
            : "\"" + name.Replace("\"", "\"\"") + "\"";

    /// <summary>Null-propagating <see cref="Quote"/> for optional names.</summary>
    public static string? QuoteOpt(string? name) => string.IsNullOrEmpty(name) ? name : Quote(name);

    /// <summary>Quotes each part of a dotted name and joins them: schema.table, t.col, …</summary>
    public static string Qualified(IEnumerable<string> parts) => string.Join(".", parts.Select(Quote));

    /// <summary>Like <see cref="Qualified"/>, with the last part quoted as a function name.</summary>
    public static string QualifiedFunc(IEnumerable<string> parts) {
        var list = parts.ToList();
        return string.Join(".", list.Select((p, i) => i == list.Count - 1 ? QuoteFunc(p) : Quote(p)));
    }

    private const string OperatorChars = "+-*/<>=~!@#%^&|`?";

    /// <summary>True for an operator name such as <c>+</c> or <c>@@</c>.</summary>
    public static bool IsOperatorSymbol(string name) => name.Length > 0 && name.All(c => OperatorChars.Contains(c));

    /// <summary>
    /// Like <see cref="QualifiedFunc"/>, but for names that may be either a function
    /// or an operator (DROP OPERATOR, COMMENT ON OPERATOR, …): an operator symbol such
    /// as <c>+</c> or <c>===</c> is written as-is, never quoted.
    /// </summary>
    public static string QualifiedObj(IEnumerable<string> parts) {
        var list = parts.ToList();
        return string.Join(".", list.Select((p, i) =>
            i < list.Count - 1 ? Quote(p)
            : IsOperatorSymbol(p) ? p
            : QuoteFunc(p)));
    }
}
