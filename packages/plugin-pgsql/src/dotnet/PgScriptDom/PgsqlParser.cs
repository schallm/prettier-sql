using System.Text.Json;
using System.Text.Json.Serialization;
using PgSqlParser;
using PrettierSql.Core;

namespace PrettierPgsql;

// Named PgsqlParser, not SqlParser: node-api-dotnet exposes static classes by simple
// name, so two loaded plugins that both define SqlParser (in different namespaces)
// collide, and whichever loads second can't find its parser.
public static class PgsqlParser {
    private static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    public static string Parse(string sql) {
        var parseResult = Parser.Parse(sql);

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
    // location, stmt_location, name_location, …, and stmt_len.
    private static bool IsPositionField(string key) => key == "stmt_len" || key.EndsWith("location");

    /// <summary>
    /// A canonical form of the SQL's meaning, for tests that check formatting didn't
    /// change it: libpg_query's full parse tree as JSON with source positions removed,
    /// plus the comment texts in order (comments aren't part of the tree). Two inputs
    /// with the same result differ only in layout, case and optional quoting.
    /// One equivalence is folded in: a boolean option value (the legacy
    /// <c>COPY … WITH CSV HEADER</c> syntax stores <c>true</c>) equals the string
    /// <c>'true'</c> of the modern syntax, as PostgreSQL's defGetBoolean reads both alike.
    /// And a function's options (LANGUAGE, AS, STRICT, …) and a DO block's are unordered,
    /// so they're sorted.
    /// Returns null when the SQL doesn't parse.
    /// </summary>
    public static string? Canonical(string sql) {
        var parseResult = Parser.Parse(sql);
        if (!parseResult.IsSuccess || parseResult.Value == null) return null;
        var tree = System.Text.Json.Nodes.JsonNode.Parse(Google.Protobuf.JsonFormatter.Default.Format(parseResult.Value));
        StripPositions(tree);
        var comments = ExtractComments(sql).Select(c => c.Text.Trim());
        return JsonSerializer.Serialize(new { tree, comments }, new JsonSerializerOptions { WriteIndented = true });
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
        var scanResult = Parser.Scan(sql);
        if (!scanResult.IsSuccess || scanResult.Value == null)
            return new List<CommentToken>();

        // tok.Start / tok.End are UTF-8 byte offsets from libpg_query; use byte slicing
        var sqlBytes = System.Text.Encoding.UTF8.GetBytes(sql);
        var comments = new List<CommentToken>();
        foreach (var tok in scanResult.Value.Tokens) {
            if (tok.Token != Token.SqlComment && tok.Token != Token.CComment)
                continue;
            var start = tok.Start;
            var end   = tok.End;
            if (start < 0 || end > sqlBytes.Length || end <= start) continue;
            comments.Add(new CommentToken {
                Text        = System.Text.Encoding.UTF8.GetString(sqlBytes, start, end - start),
                StartOffset = start,
                EndOffset   = end,
            });
        }
        return comments;
    }
}

internal class CommentToken {
    public string Text        { get; init; } = "";
    public int    StartOffset { get; init; }
    public int    EndOffset   { get; init; }
}
