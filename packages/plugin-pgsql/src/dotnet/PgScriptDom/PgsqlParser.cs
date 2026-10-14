using System.Text.Json;
using System.Text.Json.Serialization;
using PgSqlParser;
using PrettierSql.Core;

namespace PrettierPgsql;

// Named PgsqlParser, not SqlParser: node-api-dotnet exposes static classes by simple
// name, so two loaded plugins that both define SqlParser (in different namespaces)
// collide, and whichever loads second can't find its parser.
public static class PgsqlParser {
    // Before any call into pgsqlparser: find libpg_query for this platform
    static PgsqlParser() => NativeLibraries.Register();

    private static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
        // The default, 64, is a chain of about 30 operators: a || b || ... nests one node per operator
        MaxDepth = 100_000,
    };

    public static string Parse(string sql) {
        PgSqlParser.Result<ParseResult> parseResult;
        try {
            parseResult = Parser.Parse(sql);
        } catch (Google.Protobuf.InvalidProtocolBufferException) {
            // pgsqlparser reports a tree deeper than it decodes (4000 levels, a chain of about
            // 2000 operators such as a || b || ...) as a parse error; this is the decoder's own limit
            var errList = new[] { new {
                kind = "unsupported",
                message = "statement nested too deeply for the parser (a chain of about 2000 or more operators, such as a || b || ...)",
                line = 0, column = 0, offset = 0,
            }};
            return JsonSerializer.Serialize(new { errors = errList }, JsonOptions);
        }

        if (!parseResult.IsSuccess || parseResult.Value == null) {
            var err = parseResult.Error;
            var errList = new[] { new {
                kind = "parse",
                message = err?.Message ?? "Unknown parse error",
                line = 0,
                column = err?.CursorPos ?? 0,
                offset = err?.CursorPos ?? 0,
            }};
            return JsonSerializer.Serialize(new { errors = errList }, JsonOptions);
        }

        SqlNode root;
        try {
            var builder = new AstBuilder(sql);
            root = builder.Build(parseResult.Value);
        } catch (UnsupportedSqlException ex) {
            var errList = new[] { new {
                kind = "unsupported",
                message = ex.Message,
                line = 0,
                column = 0,
                offset = 0,
            }};
            return JsonSerializer.Serialize(new { errors = errList }, JsonOptions);
        }

        var comments = ExtractComments(sql);

        return JsonSerializer.Serialize(
            comments.Count > 0
                ? new { ast = root, comments } as object
                : new { ast = root } as object,
            JsonOptions);
    }

    // Parse-tree fields that record where something was written, not what it means:
    // location, stmt_location, name_location, …, stmt_len, and where a parenthesized list
    // starts and ends (list_start, rexpr_list_end, …).
    internal static bool IsPositionField(string key) =>
        key == "stmt_len" || key.EndsWith("location") || key.EndsWith("list_start") || key.EndsWith("list_end");

    /// <summary>
    /// The libpg_query fields AstBuilder never reads, one Type.Property per line (see
    /// PgsqlPropertyCoverage). The tests require each to be listed with the reason it's safe.
    /// </summary>
    public static string UnreadProperties() => string.Join('\n', PgsqlPropertyCoverage.UnreadProperties());

    /// <summary>
    /// A canonical form of the SQL's meaning, for tests that check formatting didn't
    /// change it: libpg_query's full parse tree as JSON with source positions removed,
    /// plus the comment texts in order (comments aren't part of the tree). Two inputs
    /// with the same result differ only in layout, case and optional quoting.
    /// One equivalence is folded in: a boolean option value (the legacy
    /// <c>COPY … WITH CSV HEADER</c> syntax stores <c>true</c>) equals the string
    /// <c>'true'</c> of the modern syntax, as PostgreSQL's defGetBoolean reads both alike.
    /// <c>SET TIME ZONE x</c> equals <c>SET timezone TO x</c>, which PostgreSQL documents as the same.
    /// And a function's options (LANGUAGE, AS, STRICT, …) and a DO block's are unordered,
    /// so they're sorted.
    /// Returns null when the SQL doesn't parse.
    /// </summary>
    public static string? Canonical(string sql) {
        var parseResult = Parser.Parse(sql);
        if (!parseResult.IsSuccess || parseResult.Value == null) return null;
        var tree = System.Text.Json.Nodes.JsonNode.Parse(
            Google.Protobuf.JsonFormatter.Default.Format(parseResult.Value),
            documentOptions: new System.Text.Json.JsonDocumentOptions { MaxDepth = 100_000 });
        StripPositions(tree);
        var comments = ExtractComments(sql).Select(c => c.Text.Trim());
        return JsonSerializer.Serialize(new { tree, comments }, new JsonSerializerOptions { WriteIndented = true, MaxDepth = 100_000 });
    }

    private static void SortUnordered(System.Text.Json.Nodes.JsonNode? list) {
        if (list is not System.Text.Json.Nodes.JsonArray arr) return;
        var sorted = arr.OrderBy(o => o!.ToJsonString(), StringComparer.Ordinal).Select(o => o!.DeepClone()).ToList();
        arr.Clear();
        foreach (var o in sorted) arr.Add(o);
    }

    private static void StripPositions(System.Text.Json.Nodes.JsonNode? node) {
        switch (node) {
            case System.Text.Json.Nodes.JsonObject obj:
                foreach (var key in obj.Select(p => p.Key).Where(IsPositionField).ToList()) obj.Remove(key);
                // SET TIME ZONE x is SET timezone TO x; jumble_args only marks the spelling, for query IDs
                (obj["VariableSetStmt"] as System.Text.Json.Nodes.JsonObject)?.Remove("jumble_args");
                SortUnordered(obj["CreateFunctionStmt"]?["options"]);
                SortUnordered(obj["DoStmt"]?["args"]);
                if (obj["DefElem"]?["arg"]?["Boolean"] is System.Text.Json.Nodes.JsonObject b) {
                    var value = b["boolval"]?.GetValue<bool>() == true ? "true" : "false";
                    obj["DefElem"]!["arg"] = new System.Text.Json.Nodes.JsonObject {
                        ["String"] = new System.Text.Json.Nodes.JsonObject { ["sval"] = value },
                    };
                }
                foreach (var (_, child) in obj) StripPositions(child);
                break;
            case System.Text.Json.Nodes.JsonArray arr:
                foreach (var child in arr) StripPositions(child);
                break;
        }
    }

    private static List<CommentToken> ExtractComments(string sql) {
        var sqlBytes = System.Text.Encoding.UTF8.GetBytes(sql);
        var comments = new List<CommentToken>();
        foreach (var (token, start, end) in ScanTokens(sql)) {
            if (token != Token.SqlComment && token != Token.CComment) continue;
            comments.Add(new CommentToken {
                Text        = System.Text.Encoding.UTF8.GetString(sqlBytes, start, end - start),
                StartOffset = start,
                EndOffset   = end,
            });
        }
        return comments;
    }

    /// <summary>
    /// The source's tokens, as UTF-8 byte ranges like every location in the parse tree.
    /// Scan reports string indexes, not bytes (pgsqlparser 2.0 changed that); everything
    /// downstream works in bytes until the plugin turns node offsets into string indexes.
    /// </summary>
    internal static List<(Token Token, int Start, int End)> ScanTokens(string sql) {
        var scan = Parser.Scan(sql);
        if (!scan.IsSuccess || scan.Value == null) return new();
        // byteAt[i]: the byte offset of the string index i
        var byteAt = new int[sql.Length + 1];
        for (int i = 0, b = 0; i <= sql.Length; i++) {
            byteAt[i] = b;
            if (i == sql.Length) break;
            var c = sql[i];
            b += c < 0x80 ? 1 : c < 0x800 ? 2 : char.IsHighSurrogate(c) ? 4 : char.IsLowSurrogate(c) ? 0 : 3;
        }
        return scan.Value.Tokens
            .Where(t => t.Start >= 0 && t.End <= sql.Length && t.End > t.Start)
            .Select(t => (t.Token, byteAt[t.Start], byteAt[t.End]))
            .ToList();
    }
}

internal class CommentToken {
    public string Text        { get; init; } = "";
    public int    StartOffset { get; init; }
    public int    EndOffset   { get; init; }
}
