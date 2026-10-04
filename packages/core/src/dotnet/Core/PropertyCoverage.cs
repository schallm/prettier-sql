using System.Reflection;
using System.Reflection.Emit;

namespace PrettierSql.Core;

/// <summary>
/// Which parse-tree properties an AST builder never reads. A property the builder doesn't
/// read is dropped from the output, so formatting changes the query's meaning — and the
/// fixture meaning check only notices when a fixture happens to use it. This finds them all.
///
/// The builder's property reads are the getter calls in its IL (lambdas, closures and other
/// nested types included). A tree type counts as built once the builder reads a property
/// declared on it; every property of a built type must then be read somewhere. Types the
/// builder only keeps as source text aren't checked: their text keeps every property.
/// </summary>
public static class PropertyCoverage {
    private static readonly Dictionary<short, OpCode> OpCodesByValue = typeof(OpCodes)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Select(f => (OpCode)f.GetValue(null)!)
        .ToDictionary(op => op.Value);

    /// <summary>
    /// The properties of <paramref name="treeTypes"/> that <paramref name="builder"/> never
    /// reads, as Type.Property, sorted. <paramref name="properties"/> gives the properties of
    /// a type that carry meaning (without source positions and the like).
    /// </summary>
    public static string[] Unread(Type builder, IEnumerable<Type> treeTypes, Func<Type, IEnumerable<PropertyInfo>> properties) {
        var read = new HashSet<(Module, int)>();
        foreach (var method in Methods(builder))
            foreach (var called in CalledMethods(method))
                if (called.IsSpecialName && called.Name.StartsWith("get_")) read.Add(Key(called));

        var unread = new List<string>();
        foreach (var type in treeTypes) {
            var props = properties(type).Where(p => p.GetMethod != null).ToList();
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

    private static IEnumerable<MethodBase> Methods(Type root) {
        var types = new Stack<Type>([root]);
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
