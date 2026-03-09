using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace PrettierTsql;

public static class SqlParser {
    private static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    public static string Parse(string sql) {
        var parser = new TSql160Parser(initialQuotedIdentifiers: false);
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
                    ? (t.Text.Length > 2 ? t.Text.Substring(2).TrimEnd() : "")
                    : (t.Text.Length > 4 ? t.Text.Substring(2, t.Text.Length - 4) : "");
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

    private static int[] BuildLineStarts(string text) {
        List<int> starts = [0];
        for (int i = 0; i < text.Length; i++)
            if (text[i] == '\n') starts.Add(i + 1);
        return [.. starts];
    }
}
