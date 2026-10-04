using System.Reflection;
using System.Reflection.Emit;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace PrettierTsql;

/// <summary>
/// Which ScriptDom properties the AstBuilder never reads. A property the builder doesn't
/// read is dropped from the output, so formatting changes the query's meaning — and the
/// meaning check only notices when a fixture happens to use it. This finds them all.
///
/// The builder's property reads are the getter calls in its IL (lambdas and closures
/// included). A ScriptDom type counts as built once the builder reads a property declared
/// on it; every property of a built type must then be read somewhere. Types the builder
/// only keeps as source text (RawText, LeafStatement) aren't checked: their text keeps
/// every property.
/// </summary>
internal static class PropertyCoverage {
    // Where something was written, not what it means — the same list Canonical ignores
    private static readonly HashSet<string> PositionProperties = new() {
        "StartOffset", "FragmentLength", "StartLine", "StartColumn",
        "FirstTokenIndex", "LastTokenIndex", "ScriptTokenStream",
    };

    private static readonly Dictionary<short, OpCode> OpCodesByValue = typeof(OpCodes)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Select(f => (OpCode)f.GetValue(null)!)
        .ToDictionary(op => op.Value);

    public static string[] UnreadProperties() {
        var scriptDom = typeof(TSqlFragment).Assembly;
        var read = new HashSet<(Module, int)>();
        foreach (var method in BuilderMethods())
            foreach (var getter in CalledMethods(method))
                if (getter.IsSpecialName && getter.Name.StartsWith("get_") && getter.DeclaringType?.Assembly == scriptDom)
                    read.Add(Key(getter));

        var unread = new List<string>();
        foreach (var type in scriptDom.GetExportedTypes()) {
            if (type.IsAbstract || !typeof(TSqlFragment).IsAssignableFrom(type)) continue;
            var props = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.GetMethod != null && p.GetIndexParameters().Length == 0 && !PositionProperties.Contains(p.Name))
                .ToList();
            if (!props.Any(p => p.GetMethod!.GetBaseDefinition().DeclaringType == type && read.Contains(Key(p.GetMethod!)))) continue;
            foreach (var p in props)
                if (!read.Contains(Key(p.GetMethod!))) unread.Add($"{type.Name}.{p.Name}");
        }
        unread.Sort(StringComparer.Ordinal);
        return [.. unread];
    }

    // A getter and every override of it are the same read
    private static (Module, int) Key(MethodInfo getter) {
        var def = getter.GetBaseDefinition();
        return (def.Module, def.MetadataToken);
    }

    private static IEnumerable<MethodBase> BuilderMethods() {
        var types = new Stack<Type>([typeof(AstBuilder)]);
        while (types.Count > 0) {
            var type = types.Pop();
            foreach (var nested in type.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic)) types.Push(nested);
            const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            foreach (var m in type.GetMethods(all)) yield return m;
            foreach (var c in type.GetConstructors(all)) yield return c;
        }
    }

    private static IEnumerable<MethodInfo> CalledMethods(MethodBase method) {
        var il = method.GetMethodBody()?.GetILAsByteArray();
        if (il == null) yield break;
        var typeArgs = method.DeclaringType!.IsGenericType ? method.DeclaringType.GetGenericArguments() : null;
        var methodArgs = method.IsGenericMethod ? method.GetGenericArguments() : null;
        for (var i = 0; i < il.Length;) {
            var value = il[i] == 0xFE ? (short)(0xFE00 | il[i + 1]) : il[i];
            var op = OpCodesByValue[value];
            i += op.Size;
            if (op.OperandType == OperandType.InlineMethod) {
                MethodBase? called = null;
                try { called = method.Module.ResolveMethod(BitConverter.ToInt32(il, i), typeArgs, methodArgs); } catch (ArgumentException) { }
                if (called is MethodInfo mi) yield return mi;
            }
            i += op.OperandType switch {
                OperandType.InlineNone => 0,
                OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
                OperandType.InlineVar => 2,
                OperandType.InlineI8 or OperandType.InlineR => 8,
                OperandType.InlineSwitch => 4 + 4 * BitConverter.ToInt32(il, i),
                _ => 4,
            };
        }
    }
}
