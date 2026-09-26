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
    };

    public static string Parse(string sql) {
        var parser = new TSql180Parser(initialQuotedIdentifiers: false);
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
    /// A canonical form of the SQL's meaning, for tests that check formatting didn't
    /// change it: ScriptDom's syntax tree, walked by reflection, without source
    /// positions or token streams, plus the comment texts in order (comments aren't
    /// part of the tree). Identifiers are compared by value, so [name] and name match,
    /// parentheses are unwrapped, so (a) and a match, and an unspecified sort order is
    /// ascending, as it sorts. Built-in type and function names compare case-insensitively,
    /// as SQL Server resolves them (<see cref="IsCaseInsensitiveName"/>).
    /// Returns null when the SQL doesn't parse.
    /// </summary>
    public static string? Canonical(string sql) {
        var parser = new TSql180Parser(initialQuotedIdentifiers: false);
        var fragment = parser.Parse(new StringReader(sql), out var errors);
        if (errors.Count > 0) return null;
        var comments = fragment.ScriptTokenStream
            .Where(t => t.TokenType is TSqlTokenType.SingleLineComment or TSqlTokenType.MultilineComment)
            .Select(t => t.Text.Trim());
        return JsonSerializer.Serialize(
            new { tree = CanonicalNode(fragment), comments },
            new JsonSerializerOptions { WriteIndented = true });
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
        (PivotedTableReference, "AggregateFunctionIdentifier") => true,
        // GRANT SELECT, EXECUTE, ...: permission names are keywords
        (Permission, "Identifiers") => true,
        (BuiltInFunctionTableReference, "Name") => true,
        (GlobalFunctionTableReference, "Name") => true,
        (FunctionCall { CallTarget: null }, "FunctionName") => true,
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
                    // DBCC CHECKDB: the command name is a keyword, kept as a string
                    if (fragment is DbccStatement && prop.Name == nameof(DbccStatement.DllName)) propValue = (propValue as string)?.ToLowerInvariant();
                    var child = CanonicalNode(propValue, caseInsensitive || IsCaseInsensitiveName(fragment, prop.Name));
                    if (child != null) obj[prop.Name] = child;
                }
                return obj;
            }
            case System.Collections.IEnumerable list: {
                var arr = new System.Text.Json.Nodes.JsonArray();
                foreach (var item in list) arr.Add(CanonicalNode(item, caseInsensitive));
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
