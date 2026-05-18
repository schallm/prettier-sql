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

        return JsonSerializer.Serialize(new { ast = root }, JsonOptions);
    }
}
