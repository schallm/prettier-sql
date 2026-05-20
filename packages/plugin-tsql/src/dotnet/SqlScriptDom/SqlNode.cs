namespace PrettierTsql;

/// <summary>
/// Simplified, serializable AST node transferred from C# to JavaScript as JSON.
/// No circular references — parent refs are omitted.
/// </summary>
public record SqlNode(
    string Type,
    int StartOffset,
    int EndOffset,
    string? Text,
    Dictionary<string, object?>? Props
);
