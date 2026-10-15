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
    /// TsqlPropertyCoverage). The tests require each to be listed with the reason it's safe.
    /// </summary>
    public static string UnreadProperties() => string.Join('\n', TsqlPropertyCoverage.UnreadProperties());

    /// <summary>
    /// A canonical form of the SQL's meaning, for tests that check formatting didn't
    /// change it: ScriptDom's syntax tree, walked by reflection, without source
    /// positions or token streams, plus the comment texts in order (comments aren't
    /// part of the tree). Identifiers are compared by value, so [name] and name match,
    /// parentheses are unwrapped, so (a) and a match, and an unspecified sort order is
    /// ascending, as it sorts; a multi-variable DECLARE is one DECLARE per variable. Built-in
    /// type and function names compare case-insensitively, a multi-part name's leading
    /// empty parts are dropped (..dbo.t is dbo.t), and sequence options are unordered,
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
        // {fn EXTRACT(HOUR FROM x)}: the date part is a keyword
        (ExtractFromExpression, "ExtractedElement") => true,
        // GRANT SELECT, EXECUTE, ...: permission names are keywords
        (Permission, "Identifiers") => true,
        (BuiltInFunctionTableReference, "Name") => true,
        (GlobalFunctionTableReference, "Name") => true,
        (FunctionCall { CallTarget: null }, "FunctionName") => true,
        (OdbcFunctionCall, "Name") => true,
        _ => false,
    };

    /// <summary>Properties that name a filegroup (or partition scheme), as a string or an identifier.</summary>
    private static bool IsFileGroupName(TSqlFragment owner, string property) => (owner, property) switch {
        (FileGroupOrPartitionScheme, nameof(FileGroupOrPartitionScheme.Name)) => true,
        (CreateTableStatement, nameof(CreateTableStatement.TextImageOn)) => true,
        (CreateTableStatement, nameof(CreateTableStatement.FileStreamOn)) => true,
        (FileStreamOnDropIndexOption, nameof(FileStreamOnDropIndexOption.FileStreamOn)) => true,
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
            // A multi-part name is its parts (Count and the server / database / schema / base
            // properties follow from them). A leading empty part is the current server or
            // database, or the default schema, as leaving the part off is: ..dbo.t is dbo.t,
            // .db..t is db..t. An empty part in the middle (db..t) stays.
            case MultiPartIdentifier mpi: {
                var parts = new System.Text.Json.Nodes.JsonArray();
                foreach (var id in mpi.Identifiers.SkipWhile(i => i.Value == "")) parts.Add(CanonicalNode(id, caseInsensitive));
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = mpi.GetType().Name, ["Parts"] = parts };
            }
            // varchar(MAX) and varchar(max)
            case NullLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(NullLiteral) };
            case DefaultLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(DefaultLiteral) };
            case MaxLiteral:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(MaxLiteral) };
            // The old-style WITH IGNORE_DUP_KEY parses as an IndexStateOption, IGNORE_DUP_KEY = ON as
            // its subclass: the same option, until SUPPRESS_MESSAGES is given
            case IgnoreDupKeyIndexOption { SuppressMessagesOption: null } dup:
                return CanonicalNode(new IndexStateOption { OptionKind = dup.OptionKind, OptionState = dup.OptionState });
            case Identifier id when caseInsensitive:
                return new System.Text.Json.Nodes.JsonObject { ["$type"] = nameof(Identifier), ["Value"] = id.Value.ToLowerInvariant() };
            case TSqlFragment fragment: {
                var obj = new System.Text.Json.Nodes.JsonObject { ["$type"] = fragment.GetType().Name };
                foreach (var prop in fragment.GetType().GetProperties().OrderBy(p => p.Name, StringComparer.Ordinal)) {
                    if (PositionProperties.Contains(prop.Name) || prop.GetIndexParameters().Length > 0) continue;
                    // [name] and name are the same identifier
                    if (fragment is Identifier && prop.Name == "QuoteType") continue;
                    // A built-in type is its SqlDataTypeOption (and parameters); the name is only how
                    // it was spelled: char varying, character varying and varchar are one type
                    if (fragment is SqlDataTypeReference && prop.Name == nameof(SqlDataTypeReference.Name)) continue;
                    // A bare GO at the end only ends the last batch, as the end of the script does;
                    // GO n repeat counts are compared separately (goCounts)
                    if (fragment is TSqlScript && prop.Name == nameof(TSqlScript.TrailingGoCount)) continue;
                    // WITH PAD_INDEX, FILLFACTOR = 80 is SQL Server 2000's spelling of
                    // WITH (PAD_INDEX = ON, FILLFACTOR = 80): the flag records only which was written
                    if (fragment is CreateIndexStatement && prop.Name == nameof(CreateIndexStatement.Translated80SyntaxTo90)) continue;
                    // LIKE 'x%' {ESCAPE '\'} and LIKE 'x%' ESCAPE '\' match the same rows
                    if (fragment is LikePredicate && prop.Name == nameof(LikePredicate.OdbcEscape)) continue;
                    // DECLARE @t AS TABLE and DECLARE @t TABLE declare the same variable
                    if (fragment is DeclareTableVariableBody && prop.Name == nameof(DeclareTableVariableBody.AsDefined)) continue;
                    // DBCC TRACESTATUS () and DBCC TRACESTATUS run the same command
                    if (fragment is DbccStatement && prop.Name == nameof(DbccStatement.ParenthesisRequired)) continue;
                    // {fn CURRENT_TIME} and {fn CURRENT_TIME()} call the same function
                    if (fragment is OdbcFunctionCall && prop.Name == nameof(OdbcFunctionCall.ParametersUsed)) continue;
                    var propValue = prop.GetValue(fragment);
                    // 0x0A and 0x0a are the same bytes
                    if (fragment is BinaryLiteral && prop.Name == nameof(BinaryLiteral.Value)) propValue = (propValue as string)?.ToLowerInvariant();
                    // A retention period of 1 MONTHS is 1 MONTH, and 6 MONTH is 6 MONTHS
                    if (fragment is RetentionPeriodDefinition && prop.Name == nameof(RetentionPeriodDefinition.Units))
                        propValue = propValue?.ToString()?.TrimEnd('s');
                    // ALTER SCHEMA s TRANSFER OBJECT::t and TRANSFER t: OBJECT is the class when none is given
                    if (fragment is AlterSchemaStatement && prop.Name == nameof(AlterSchemaStatement.ObjectKind) && propValue?.ToString() == "Object")
                        propValue = "NotSpecified";
                    // ON 'fg', ON "fg" and ON [fg] name the same filegroup ('default' and [default] the default one)
                    if (IsFileGroupName(fragment, prop.Name) && propValue is IdentifierOrValueExpression { ValueExpression: StringLiteral fileGroup })
                        propValue = new IdentifierOrValueExpression { Identifier = new Identifier { Value = fileGroup.Value } };
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
                    // CREATE / ALTER SEQUENCE options are a set: MAXVALUE 2 MINVALUE 1 is MINVALUE 1 MAXVALUE 2
                    if (fragment is SequenceStatement && prop.Name == nameof(SequenceStatement.SequenceOptions) && child is System.Text.Json.Nodes.JsonArray options)
                        child = new System.Text.Json.Nodes.JsonArray(options
                            .OrderBy(o => o!.ToJsonString(), StringComparer.Ordinal).Select(o => o!.DeepClone()).ToArray());
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
