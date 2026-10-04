using System.Reflection;
using Google.Protobuf;
using Google.Protobuf.Reflection;
using PgSqlParser;

namespace PrettierPgsql;

/// <summary>
/// The libpg_query fields AstBuilder never reads (see PrettierSql.Core.PropertyCoverage):
/// the protobuf fields of each message, without source positions (the same ones Canonical
/// strips) and without oneof members. A oneof such as Node's is a union the builder
/// dispatches on, and a case it has no branch for falls back to the statement's source
/// text or throws UnsupportedSqlException — it isn't silently dropped.
/// </summary>
internal static class PgsqlPropertyCoverage {
    public static string[] UnreadProperties() => PrettierSql.Core.PropertyCoverage.Unread(
        typeof(AstBuilder),
        typeof(ParseResult).Assembly.GetExportedTypes().Where(t => typeof(IMessage).IsAssignableFrom(t) && !t.IsAbstract),
        Fields);

    private static IEnumerable<PropertyInfo> Fields(Type message) {
        if (message.GetProperty("Descriptor", BindingFlags.Public | BindingFlags.Static)?.GetValue(null) is not MessageDescriptor descriptor)
            return [];
        return descriptor.Fields.InDeclarationOrder()
            .Where(f => f.RealContainingOneof == null && !PgsqlParser.IsPositionField(f.Name))
            .Select(f => message.GetProperty(f.PropertyName)!)
            .Where(p => p != null);
    }
}
