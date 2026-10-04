using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.SqlServer.TransactSql.ScriptDom;
using PrettierSql.Core;

namespace PrettierTsql;

// Named TsqlParser, not SqlParser: node-api-dotnet exposes static classes by simple
// name, so two loaded plugins that both define SqlParser (in different namespaces)
// collide, and whichever loads second can't find its parser.
public static class TsqlParser {
    private static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
        // A long chain of AND, + or JOIN is a left-nested tree, two JSON levels per term: the default of 64 allows only ~30
        MaxDepth = 100_000,
    };

    /// <summary>
    /// ScriptDom splits a script at GO but doesn't accept a repeat count (GO 5), which sqlcmd and
    /// SSMS do. Returns the script with each count blanked out (same length, so every offset
    /// still holds), and the offset and count of every GO line (count null when it has none).
    /// </summary>
    private static string BlankGoCounts(string sql, out List<(int Offset, int? Count)> gos) {
        gos = [];
        var tokens = new TSql180Parser(initialQuotedIdentifiers: false).GetTokenStream(new StringReader(sql), out _);
        var chars = sql.ToCharArray();
        for (var i = 0; i < tokens.Count; i++) {
            if (tokens[i].TokenType != TSqlTokenType.Go) continue;
            int? count = null;
            var j = i + 1;
            while (j < tokens.Count && tokens[j].TokenType == TSqlTokenType.WhiteSpace && !tokens[j].Text.Contains('\n')) j++;
            if (j < tokens.Count && tokens[j].TokenType == TSqlTokenType.Integer && int.TryParse(tokens[j].Text, out var n)) {
                // only blanks and comments may follow on the line
                var k = j + 1;
                while (k < tokens.Count && (tokens[k].TokenType is TSqlTokenType.SingleLineComment or TSqlTokenType.MultilineComment
                       || (tokens[k].TokenType == TSqlTokenType.WhiteSpace && !tokens[k].Text.Contains('\n')))) k++;
                if (k >= tokens.Count || tokens[k].TokenType is TSqlTokenType.EndOfFile
                    || (tokens[k].TokenType == TSqlTokenType.WhiteSpace && tokens[k].Text.Contains('\n'))) {
                    count = n;
                    for (var c = 0; c < tokens[j].Text.Length; c++) chars[tokens[j].Offset + c] = ' ';
                }
            }
            gos.Add((tokens[i].Offset, count));
        }
        return new string(chars);
    }

    public static string Parse(string sql) {
        var parser = new TSql180Parser(initialQuotedIdentifiers: false);
        var original = sql;
        sql = BlankGoCounts(sql, out var gos);
        var fragment = parser.Parse(new StringReader(sql), out var errors);

        if (errors.Count > 0) {
            var errList = errors.Select(e => new {
                message = e.Message,
                line = e.Line,
                column = e.Column,
                offset = e.Offset,
            });
            return JsonSerializer.Serialize(new { errors = errList }, JsonOptions);
        }

        var builder = new AstBuilder();
        fragment.Accept(builder);
        AttachGoCounts(builder.Root, gos);

        var lineStarts = BuildLineStarts(sql);
        var comments = fragment.ScriptTokenStream
            .Where(t => t.TokenType == TSqlTokenType.SingleLineComment
                     || t.TokenType == TSqlTokenType.MultilineComment)
            .Select(t => {
                bool isLine = t.TokenType == TSqlTokenType.SingleLineComment;
                int start = lineStarts[t.Line - 1] + (t.Column - 1);
                string value = isLine
                    ? (t.Text.Length > 2 ? t.Text.AsSpan(2).TrimEnd().ToString() : "")
                    : (t.Text.Length > 4 ? t.Text.AsSpan(2, t.Text.Length - 4).ToString() : "");
                return new {
                    type = isLine ? "line" : "block",
                    value,
                    text = t.Text,
                    startOffset = start,
                    endOffset = start + t.Text.Length,
                };
            })
            .ToList();

        return JsonSerializer.Serialize(new { ast = builder.Root, comments }, JsonOptions);
    }

    /// <summary>
    /// Records the GO lines that carry a count: on the batch they follow ("goLines": the counts of
    /// every GO line between it and the next batch, null for a bare GO), or on the script
    /// ("goBefore") when they come before the first batch.
    /// </summary>
    private static void AttachGoCounts(SqlNode? root, List<(int Offset, int? Count)> gos) {
        if (root?.Props == null || !gos.Any(g => g.Count != null)) return;
        var batches = (root.Props["batches"] as List<object?>)?.OfType<SqlNode>().ToList() ?? [];
        var before = new List<object?>();
        var after = new Dictionary<SqlNode, List<object?>>();
        foreach (var (offset, count) in gos) {
            var batch = batches.LastOrDefault(b => b.EndOffset <= offset);
            if (batch == null) before.Add(count);
            else {
                if (!after.TryGetValue(batch, out var list)) after[batch] = list = [];
                list.Add(count);
            }
        }
        if (before.Any(c => c != null)) root.Props["goBefore"] = before;
        foreach (var (batch, list) in after)
            if (list.Any(c => c != null)) batch.Props!["goLines"] = list;
    }

    /// <summary>
    /// The ScriptDom properties AstBuilder never reads, one Type.Property per line (see
    /// PropertyCoverage). The tests require each to be listed with the reason it's safe.
    /// </summary>
    public static string UnreadProperties() => string.Join('\n', PropertyCoverage.UnreadProperties());

    /// <summary>
    /// A canonical form of the SQL's meaning, for tests that check formatting didn't
    /// change it: ScriptDom's syntax tree, walked by reflection, without source
    /// positions or token streams, plus the comment texts in order (comments aren't
    /// part of the tree). Identifiers are compared by value, so [name] and name match,
    /// parentheses are unwrapped, so (a) and a match, and an unspecified sort order is
    /// ascending, as it sorts; a multi-variable DECLARE is one DECLARE per variable. Built-in
    /// type and function names compare case-insensitively,
    /// as SQL Server resolves them (<see cref="IsCaseInsensitiveName"/>).
    /// Returns null when the SQL doesn't parse.
    /// </summary>
    public static string? Canonical(string sql) {
        var parser = new TSql180Parser(initialQuotedIdentifiers: false);
        sql = BlankGoCounts(sql, out var gos);
        var fragment = parser.Parse(new StringReader(sql), out var errors);
        if (errors.Count > 0) return null;
        var comments = fragment.ScriptTokenStream
            .Where(t => t.TokenType is TSqlTokenType.SingleLineComment or TSqlTokenType.MultilineComment)
            .Select(t => t.Text.Trim());
        return JsonSerializer.Serialize(
            new { tree = CanonicalNode(fragment), comments, goCounts = gos.Where(g => g.Count != null).Select(g => g.Count) },
            new JsonSerializerOptions { WriteIndented = true, MaxDepth = 100_000 });
    }

    // Properties that record where something was written, not what it means.
    private static readonly HashSet<string> PositionProperties = new() {
        "StartOffset", "FragmentLength", "StartLine", "StartColumn",
        "FirstTokenIndex", "LastTokenIndex", "ScriptTokenStream",
    };

    /// <summary>
    /// Names SQL Server matches case-insensitively whatever the collation: built-in data
    /// types, built-in table-valued functions, and unqualified scalar function calls —
    /// a scalar UDF can only be called schema-qualified, so those are built-ins too.
    /// User-defined names can be case-sensitive, so everything else keeps its case.
    /// </summary>
    private static bool IsCaseInsensitiveName(TSqlFragment owner, string property) => (owner, property) switch {
        (SqlDataTypeReference, "Name") => true,
        (XmlDataTypeReference, "Name") => true,
        (VectorDataTypeReference, "Name") => true,
        // Keywords ScriptDom stores as identifiers: ABSENT ON NULL, IGNORE NULLS, PIVOT (SUM(...))
        (FunctionCall, "AbsentOrNullOnNull") => true,
        (FunctionCall, "IgnoreRespectNulls") => true,
        // TRIM(BOTH/LEADING/TRAILING ... FROM ...): TrimOptions is a keyword, not an identifier
        (FunctionCall, "TrimOptions") => true,
        (PivotedTableReference, "AggregateFunctionIdentifier") => true,
        // GRANT SELECT, EXECUTE, ...: permission names are keywords
        (Permission, "Identifiers") => true,
        (BuiltInFunctionTableReference, "Name") => true,
        (GlobalFunctionTableReference, "Name") => true,
        (FunctionCall { CallTarget: null }, "FunctionName") => true,
        (OdbcFunctionCall, "Name") => true,
        _ => false,
    };

    private static System.Text.Json.Nodes.JsonNode? CanonicalNode(object? value, bool caseInsensitive = false) {
        switch (value) {
            case null:
                return null;
            case string or bool or int or long or decimal or double:
                return System.Text.Json.Nodes.JsonValue.Create(value);
            // ORDER BY a and ORDER BY a ASC sort the same way
            case SortOrder.NotSpecified:
                return System.Text.Json.Nodes.JsonValue.Create(nameof(SortOrder.Ascending));
            // SELECT ALL a and SELECT a, COUNT(ALL a) and COUNT(a): ALL is what happens without it
            case UniqueRowFilter.All:
                return System.Text.Json.Nodes.JsonValue.Create(nameof(UniqueRowFilter.NotSpecified));
            case Enum e:
                return System.Text.Json.Nodes.JsonValue.Create(e.ToString());
            // Parentheses are syntax: the tree's shape already records the grouping they
            // gave, so (a) and a compare equal, while a dropped, needed pair still changes it
            case ParenthesisExpression p:
                return CanonicalNode(p.Expression);
            case BooleanParenthesisExpression bp:
                return CanonicalNode(bp.Expression);
            case QueryParenthesisExpression qp when qp.OrderByClause == null && qp.OffsetClause == null && qp.ForClause == null:
                return CanonicalNode(qp.QueryExpression);
            // varchar(MAX) and varchar(max)
            case NullLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(NullLiteral) };
            case DefaultLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(DefaultLiteral) };
            case MaxLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(MaxLiteral) };
            case Identifier id when caseInsensitive:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(Identifier), ["Value"] = id.Value.ToLowerInvariant() };
            case TSqlFragment fragment: {
                var obj = new System.Text.Json.Nodes.JsonObject { ["$type"] = fragment.GetType().Name };
                foreach (var prop in fragment.GetType().GetProperties().OrderBy(p => p.Name, StringComparer.Ordinal)) {
                    if (PositionProperties.Contains(prop.Name) || prop.GetIndexParameters().Length > 0) continue;
                    // [name] and name are the same identifier
                    if (fragment is Identifier && prop.Name == "QuoteType") continue;
                    var propValue = prop.GetValue(fragment);
                    // A procedure or trigger body is its statement list: AS BEGIN ... END and
                    // AS ... are the same body, and the printer adds the BEGIN/END
                    if (fragment is ProcedureStatementBody or TriggerStatementBody && prop.Name == "StatementList"
                        && propValue is StatementList { Statements: [BeginEndBlockStatement block] } && block is not BeginEndAtomicBlockStatement)
                        propValue = block.StatementList;
                    // a AS 'x', 'x' = a and a AS x name the column the same
                    if (fragment is SelectScalarExpression && prop.Name == "ColumnName" && propValue is IdentifierOrValueExpression alias) {
                        obj[prop.Name] = alias.Value;
                        continue;
                    }
                    // FETCH c and FETCH NEXT FROM c: NEXT is the orientation when none is given
                    if (fragment is FetchCursorStatement && prop.Name == nameof(FetchCursorStatement.FetchType) && propValue == null)
                        propValue = new FetchType { Orientation = FetchOrientation.Next };
                    // INSERT t and INSERT INTO t
                    if (fragment is InsertSpecification && prop.Name == "InsertOption" && propValue is InsertOption.None)
                        propValue = InsertOption.Into;
                    // DBCC CHECKDB: the command name is a keyword, kept as a string
                    if (fragment is DbccStatement && prop.Name == nameof(DbccStatement.DllName)) propValue = (propValue as string)?.ToLowerInvariant();
                    var child = CanonicalNode(propValue, caseInsensitive || IsCaseInsensitiveName(fragment, prop.Name));
                    if (child != null) obj[prop.Name] = child;
                }
                return obj;
            }
            case System.Collections.IEnumerable list: {
                var arr = new System.Text.Json.Nodes.JsonArray();
                foreach (var item in list) {
                    // DECLARE @a int, @b int declares the same as one DECLARE per variable,
                    // which is how it's printed
                    if (item is DeclareVariableStatement { Declarations.Count: > 1 } declare) {
                        foreach (var d in declare.Declarations) {
                            var single = new DeclareVariableStatement();
                            single.Declarations.Add(d);
                            arr.Add(CanonicalNode(single, caseInsensitive));
                        }
                        continue;
                    }
                    arr.Add(CanonicalNode(item, caseInsensitive));
                }
                return arr.Count > 0 ? arr : null;
            }
            default:
                return System.Text.Json.Nodes.JsonValue.Create(value.ToString());
        }
    }

    private static int[] BuildLineStarts(string text) {
        List<int> starts = [0];
        for (int i = 0; i < text.Length; i++)
            if (text[i] == '\n') starts.Add(i + 1);
        return [.. starts];
    }
}
