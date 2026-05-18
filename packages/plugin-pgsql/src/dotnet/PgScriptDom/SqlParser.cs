using System.Text.Json;
using System.Text.Json.Serialization;
using PgSqlParser;

namespace PrettierPgsql;

public static class SqlParser {
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
                message = err?.Message ?? "Unknown parse error",
                line = 0,
                column = err?.CursorPos ?? 0,
                offset = err?.CursorPos ?? 0,
            }};
            return JsonSerializer.Serialize(new { errors = errList }, JsonOptions);
        }

        var builder = new AstBuilder(sql);
        var root = builder.Build(parseResult.Value);

        var comments = ExtractComments(sql);

        return JsonSerializer.Serialize(
            comments.Count > 0
                ? new { ast = root, comments } as object
                : new { ast = root } as object,
            JsonOptions);
    }

    private static List<CommentToken> ExtractComments(string sql) {
        var scanResult = Parser.Scan(sql);
        if (!scanResult.IsSuccess || scanResult.Value == null)
            return new List<CommentToken>();

        var comments = new List<CommentToken>();
        foreach (var tok in scanResult.Value.Tokens) {
            if (tok.Token != Token.SqlComment && tok.Token != Token.CComment)
                continue;
            var start = tok.Start;
            var end   = tok.End;
            if (start < 0 || end > sql.Length || end <= start) continue;
            comments.Add(new CommentToken {
                Text        = sql.Substring(start, end - start),
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
