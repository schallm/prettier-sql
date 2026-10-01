using System.Text;
using Microsoft.SqlServer.TransactSql.ScriptDom;
using PrettierSql.Core;

namespace PrettierTsql;

/// <summary>
/// Walks the ScriptDom fragment tree and builds a simplified SqlNode tree.
/// </summary>
public class AstBuilder : TSqlFragmentVisitor {
    public SqlNode? Root { get; private set; }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static SqlNode Leaf(string type, TSqlFragment f, string? text = null) =>
        new(type, f.StartOffset, f.StartOffset + f.FragmentLength, text, null);

    /// <summary>Reconstructs raw SQL text for a fragment using its token stream.</summary>
    private static string RawText(TSqlFragment f) {
        var stream = f.ScriptTokenStream;
        if (stream == null || stream.Count == 0) return f.GetType().Name;
        var start = f.StartOffset;
        var end = start + f.FragmentLength;
        var sb = new StringBuilder();
        foreach (var t in stream)
            if (t.Offset >= start && t.Offset < end)
                sb.Append(t.Text);
        return sb.ToString().Trim();
    }

    /// <summary>
    /// Source text of a WITH-list option, from its first token to the next top-level comma or
    /// closing parenthesis. Some option fragments cover only their first keyword (or only
    /// their value), so <see cref="RawText"/> drops the rest — `distribution` for
    /// `distribution = hash(a)`. Comments are skipped and whitespace collapsed to one space.
    /// </summary>
    private static string OptionText(TSqlFragment opt) {
        var stream = opt.ScriptTokenStream;
        if (stream == null || opt.FirstTokenIndex < 0) return RawText(opt);
        var sb = new StringBuilder();
        var depth = 0;
        for (var i = opt.FirstTokenIndex; i < stream.Count; i++) {
            var t = stream[i];
            if (t.TokenType == TSqlTokenType.LeftParenthesis) depth++;
            else if (t.TokenType == TSqlTokenType.RightParenthesis) { if (depth == 0) break; depth--; }
            else if (depth == 0 && (t.TokenType == TSqlTokenType.Comma || t.TokenType == TSqlTokenType.Semicolon)) break;
            if (t.TokenType == TSqlTokenType.SingleLineComment || t.TokenType == TSqlTokenType.MultilineComment) continue;
            sb.Append(t.TokenType == TSqlTokenType.WhiteSpace ? " " : t.Text);
        }
        return System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
    }

    private static SqlNode Node(string type, TSqlFragment f, Dictionary<string, object?> props) =>
        new(type, f.StartOffset, f.StartOffset + f.FragmentLength, null, props);

    /// <summary>
    /// Project a ScriptDom collection to a serializable List&lt;object?&gt;, or null when empty/null.
    /// Avoids the repeated `coll?.Count > 0 ? coll.Select(...).ToList() : null` idiom.
    /// </summary>
    private static List<object?>? MapList<T>(IList<T>? items, Func<T, object?> map) =>
        items == null || items.Count == 0 ? null : items.Select(map).ToList();

    /// <summary>Convenience: RawText(x) when not null, else null.</summary>
    private static string? RawTextOrNull(TSqlFragment? f) => f == null ? null : RawText(f);

    /// <summary>
    /// Extracts data-type size/precision/scale parameters as strings.
    /// Prefers ParameterizedDataTypeReference.Parameters; falls back to parsing the raw
    /// token text for types that ScriptDom represents as UserDataTypeReference with no
    /// Parameters collection (e.g. VECTOR(1536) in SQL Server 2025).
    /// XmlDataTypeReference is excluded — its schema-collection argument is handled separately.
    /// </summary>
    private static List<object?>? DataTypeParams(DataTypeReference? dt) {
        if (dt == null || dt is XmlDataTypeReference) return null;
        if (dt is ParameterizedDataTypeReference pdt && pdt.Parameters?.Count > 0)
            return pdt.Parameters.Select(p => (object?)p.Value).ToList();
        var raw = RawText(dt);
        var lparen = raw.IndexOf('(');
        var rparen = raw.LastIndexOf(')');
        if (lparen < 0 || rparen <= lparen) return null;
        var inner = raw[(lparen + 1)..rparen].Trim();
        return string.IsNullOrEmpty(inner)
            ? null
            : inner.Split(',').Select(s => (object?)s.Trim()).ToList();
    }

    private static SqlNode? BuildIdentifier(Identifier? id) =>
        id == null ? null : Leaf("Identifier", id, QuotedName(id));

    // T-SQL reserved words that are valid identifier characters but cannot be used
    // as unquoted identifiers in column-reference or alias positions.
    // T-SQL reserved keywords (plus VALUE): a bracketed identifier with one of these
    // names must keep its brackets — `[order]`, `[primary]` — or the output won't parse.
    private static readonly HashSet<string> _reservedWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADD", "ALL", "ALTER", "AND", "ANY", "AS", "ASC", "AUTHORIZATION", "BACKUP", "BEGIN",
        "BETWEEN", "BREAK", "BROWSE", "BULK", "BY", "CASCADE", "CASE", "CHECK", "CHECKPOINT",
        "CLOSE", "CLUSTERED", "COALESCE", "COLLATE", "COLUMN", "COMMIT", "COMPUTE", "CONSTRAINT",
        "CONTAINS", "CONTAINSTABLE", "CONTINUE", "CONVERT", "CREATE", "CROSS", "CURRENT",
        "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP", "CURRENT_USER", "CURSOR", "DATABASE",
        "DBCC", "DEALLOCATE", "DECLARE", "DEFAULT", "DELETE", "DENY", "DESC", "DISK", "DISTINCT",
        "DISTRIBUTED", "DOUBLE", "DROP", "DUMP", "ELSE", "END", "ERRLVL", "ESCAPE", "EXCEPT",
        "EXEC", "EXECUTE", "EXISTS", "EXIT", "EXTERNAL", "FETCH", "FILE", "FILLFACTOR", "FOR",
        "FOREIGN", "FREETEXT", "FREETEXTTABLE", "FROM", "FULL", "FUNCTION", "GOTO", "GRANT",
        "GROUP", "HAVING", "HOLDLOCK", "IDENTITY", "IDENTITY_INSERT", "IDENTITYCOL", "IF", "IN",
        "INDEX", "INNER", "INSERT", "INTERSECT", "INTO", "IS", "JOIN", "KEY", "KILL", "LEFT",
        "LIKE", "LINENO", "LOAD", "MERGE", "NATIONAL", "NOCHECK", "NONCLUSTERED", "NOT", "NULL",
        "NULLIF", "OF", "OFF", "OFFSETS", "ON", "OPEN", "OPENDATASOURCE", "OPENQUERY",
        "OPENROWSET", "OPENXML", "OPTION", "OR", "ORDER", "OUTER", "OVER", "PERCENT", "PIVOT",
        "PLAN", "PRECISION", "PRIMARY", "PRINT", "PROC", "PROCEDURE", "PUBLIC", "RAISERROR",
        "READ", "READTEXT", "RECONFIGURE", "REFERENCES", "REPLICATION", "RESTORE", "RESTRICT",
        "RETURN", "REVERT", "REVOKE", "RIGHT", "ROLLBACK", "ROWCOUNT", "ROWGUIDCOL", "RULE",
        "SAVE", "SCHEMA", "SECURITYAUDIT", "SELECT", "SEMANTICKEYPHRASETABLE",
        "SEMANTICSIMILARITYDETAILSTABLE", "SEMANTICSIMILARITYTABLE", "SESSION_USER", "SET",
        "SETUSER", "SHUTDOWN", "SOME", "STATISTICS", "SYSTEM_USER", "TABLE", "TABLESAMPLE",
        "TEXTSIZE", "THEN", "TO", "TOP", "TRAN", "TRANSACTION", "TRIGGER", "TRUNCATE",
        "TRY_CONVERT", "TSEQUAL", "UNION", "UNIQUE", "UNPIVOT", "UPDATE", "UPDATETEXT", "USE",
        "USER", "VALUES", "VARYING", "VIEW", "WAITFOR", "WHEN", "WHERE", "WHILE", "WITH",
        "WITHIN", "WRITETEXT",
        "VALUE",
    };

    /// <summary>
    /// Returns the identifier value, wrapping it in square brackets only when the
    /// name contains characters that are invalid in an unquoted T-SQL identifier
    /// (spaces, hyphens, leading digits, etc.) or when the name is a T-SQL
    /// reserved word.  Plain names like "Books" or "dbo" are returned as-is;
    /// "My Column" becomes "[My Column]"; "key" becomes "[key]".
    /// </summary>
    private static string? QuotedName(Identifier? id) {
        if (id == null) return null;
        var v = id.Value;
        if (string.IsNullOrEmpty(v)) return v;
        bool needsBrackets = _reservedWords.Contains(v) ||
            !System.Text.RegularExpressions.Regex.IsMatch(v, @"^[A-Za-z_@#][A-Za-z0-9_@#$]*$");
        // A ] inside the name is escaped by doubling it: [a]]b]
        return needsBrackets ? $"[{v.Replace("]", "]]")}]" : v;
    }

    /// <summary>
    /// A function or method name: brackets only when the name can't be written bare.
    /// KEY and VALUE are bracketed as column names by house style, but never as method
    /// names — `x.value('.', 'int')` must not become `x.[value](...)`.
    /// </summary>
    private static string? QuotedFunctionName(Identifier? id) =>
        string.Equals(id?.Value, "value", StringComparison.OrdinalIgnoreCase)
            || string.Equals(id?.Value, "key", StringComparison.OrdinalIgnoreCase)
            ? id!.Value
            : QuotedName(id);

    /// <summary>
    /// For names that may be an identifier or a value (cursor names, column aliases):
    /// quote the identifier form; a variable or literal is returned as written.
    /// </summary>
    private static string? QuotedName(IdentifierOrValueExpression? name) =>
        name?.Identifier != null ? QuotedName(name.Identifier) : name?.Value;

    /// <summary>
    /// Where a table, index or constraint is stored: ON filegroup, or ON scheme(column) for
    /// a partition scheme — the column says how rows are partitioned, so it must be kept.
    /// </summary>
    private static string? StorageTarget(FileGroupOrPartitionScheme? f) {
        if (f == null) return null;
        var name = QuotedName(f.Name);
        return f.PartitionSchemeColumns?.Count > 0
            ? $"{name}({string.Join(", ", f.PartitionSchemeColumns.Select(QuotedName))})"
            : name;
    }

    /// <summary>A multi-part object name as text: `server.db.schema.name`, each part bracketed only when it must be.</summary>
    private static string SchemaObjectText(SchemaObjectName name) =>
        string.Join(".", name.Identifiers.Select(i => QuotedName(i)));

    private static SqlNode? BuildSchemaObjectName(SchemaObjectName? name) =>
        name == null ? null : new SqlNode(
            "SchemaObjectName",
            name.StartOffset,
            name.StartOffset + name.FragmentLength,
            QuotedName(name.BaseIdentifier),
            new Dictionary<string, object?> {
                ["schema"] = QuotedName(name.SchemaIdentifier),
                ["database"] = QuotedName(name.DatabaseIdentifier),
                ["server"] = QuotedName(name.ServerIdentifier),
                ["name"] = QuotedName(name.BaseIdentifier),
            });

    private static SqlNode? BuildScalarExpression(ScalarExpression? expr) {
        var node = BuildScalarExpressionCore(expr);
        // COLLATE can follow any primary expression — a literal, variable, function call,
        // CAST, CASE, subquery or parenthesized expression. (Column references carry
        // theirs already: BuildColumnRef. An expression kept as raw text — the
        // "ScalarExpression" fallback — already includes its COLLATE.)
        if (expr is PrimaryExpression { Collation: not null } primary && expr is not ColumnReferenceExpression
            && node != null && node.Type != "ScalarExpression")
            return new SqlNode("CollateExpression", expr.StartOffset, expr.StartOffset + expr.FragmentLength, null,
                new Dictionary<string, object?> { ["expression"] = node, ["collation"] = primary.Collation.Value });
        return node;
    }

    private static SqlNode? BuildScalarExpressionCore(ScalarExpression? expr) {
        if (expr == null) return null;
        return expr switch {
            ColumnReferenceExpression col => BuildColumnRef(col),
            IntegerLiteral lit => Leaf("IntegerLiteral", lit, lit.Value),
            StringLiteral str => str.IsNational
                ? new SqlNode("StringLiteral", str.StartOffset, str.StartOffset + str.FragmentLength, str.Value,
                    new Dictionary<string, object?> { ["isNational"] = true })
                : Leaf("StringLiteral", str, str.Value),
            NullLiteral nl => Leaf("NullLiteral", nl),
            NumericLiteral num => Leaf("NumericLiteral", num, num.Value),
            RealLiteral real => Leaf("RealLiteral", real, real.Value),
            BinaryLiteral bin => Leaf("BinaryLiteral", bin, bin.Value),
            MoneyLiteral money => Leaf("MoneyLiteral", money, money.Value),
            VariableReference varRef => Leaf("VariableReference", varRef, varRef.Name),
            GlobalVariableExpression gv => Leaf("GlobalVariable", gv, gv.Name),
            FunctionCall fc => BuildFunctionCall(fc),
            BinaryExpression bin => BuildBinaryExpr(bin),
            UnaryExpression un => BuildUnaryExpr(un),
            ParenthesisExpression paren => BuildParenExpr(paren),
            CaseExpression caseExpr => BuildCaseExpr(caseExpr),
            CastCall cast => BuildCastCall(cast),
            ConvertCall conv => BuildConvertCall(conv),
            IIfCall iif => BuildIIfCall(iif),
            CoalesceExpression coalesce => BuildCoalesceExpr(coalesce),
            NullIfExpression nullif => BuildNullIfExpr(nullif),
            TryCastCall tryCast => BuildTryCastCall(tryCast),
            TryConvertCall tryConv => BuildTryConvertCall(tryConv),
            AtTimeZoneCall atz => BuildAtTimeZoneCall(atz),
            ScalarSubquery sub => BuildScalarSubquery(sub),
            NextValueForExpression nv => BuildNextValueFor(nv),
            ParseCall pc => BuildParseCallNode(pc, false),
            TryParseCall tpc => BuildParseCallNode(tpc, true),
            ParameterlessCall plc => Leaf("ParameterlessCall", plc, ParameterlessCallKeyword(plc.ParameterlessCallType)),
            DefaultLiteral dl => Leaf("DefaultLiteral", dl, "DEFAULT"),
            PartitionFunctionCall pfc => BuildPartitionFunctionCall(pfc),
            IdentityFunctionCall ifc => BuildIdentityFunctionCall(ifc),
            ExtractFromExpression ext => BuildExtractFrom(ext),
            // ScriptDom represents LEFT/RIGHT as dedicated subtypes (not FunctionCall)
            LeftFunctionCall lfc => BuildBuiltinCall("left", lfc, lfc.Parameters),
            RightFunctionCall rfc => BuildBuiltinCall("right", rfc, rfc.Parameters),
            // ODBC escape function: {fn Name(args)} — render as a regular function call
            // {fn UCASE('a')}: an ODBC escape; UCASE and friends only exist inside one
            OdbcFunctionCall odbc => Node("OdbcFunctionCall", odbc, new Dictionary<string, object?> {
                ["name"] = odbc.Name?.Value,
                ["args"] = odbc.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList(),
            }),
            _ => Leaf("ScalarExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildColumnRef(ColumnReferenceExpression col) {
        // COUNT(*) uses ColumnType.Wildcard with no identifiers
        if (col.ColumnType == ColumnType.Wildcard)
            return Leaf("WildcardColumn", col, "*");

        var parts = col.MultiPartIdentifier?.Identifiers.Select(i => QuotedName(i)).ToList();
        // Pseudo-columns ($action, $IDENTITY, $ROWGUID, $node_id, ...) have no identifier
        // parts; without this they printed as nothing at all.
        if (parts == null || parts.Count == 0) parts = [RawText(col).Trim()];
        var colNode = new SqlNode(
            "ColumnReference",
            col.StartOffset,
            col.StartOffset + col.FragmentLength,
            parts != null ? string.Join(".", parts) : null,
            new Dictionary<string, object?> {
                ["parts"] = parts,
            });

        // COLLATE clause: Name COLLATE Latin1_General_CI_AS
        var collation = col.Collation?.Value;
        if (collation != null)
            return new SqlNode("CollateExpression", col.StartOffset, col.StartOffset + col.FragmentLength, null,
                new Dictionary<string, object?> { ["expression"] = colNode, ["collation"] = collation });
        return colNode;
    }

    private static SqlNode BuildFunctionCall(FunctionCall fc) {
        var args = fc.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var overClause = fc.OverClause != null ? BuildOverClause(fc.OverClause) : null;
        // IGNORE NULLS / RESPECT NULLS modifier (SQL Server 2022+)
        string? nullsModifier = fc.IgnoreRespectNulls?.Count > 0
            ? string.Join(" ", fc.IgnoreRespectNulls.Select(id => id.Value))
            : null;
        // TRIM(LEADING|TRAILING|BOTH ...) direction (SQL Server 2022+)
        string? trimOptions = fc.TrimOptions?.Value;
        // JSON_OBJECT key:value pairs (SQL Server 2022+)
        var jsonParams = fc.JsonParameters?.Count > 0
            ? fc.JsonParameters.Select(p => (object?)BuildJsonKeyValue(p)).ToList()
            : null;
        // NULL ON NULL / ABSENT ON NULL clause on JSON functions (SQL Server 2022+)
        string? nullOnNull = fc.AbsentOrNullOnNull?.Count > 0
            ? string.Join(" ", fc.AbsentOrNullOnNull.Select(id => id.Value))
            : null;
        // ORDER BY inside JSON_ARRAYAGG (SQL Server 2022+)
        var jsonOrderBy = fc.JsonOrderByClause != null ? BuildOrderByClause(fc.JsonOrderByClause) : null;
        // WITHIN GROUP (ORDER BY ...) for STRING_AGG, PERCENTILE_CONT/DISC etc.
        var withinGroup = fc.WithinGroupClause != null ? BuildOrderByClause(fc.WithinGroupClause.OrderByClause) : null;
        return new SqlNode(
            "FunctionCall",
            fc.StartOffset,
            fc.StartOffset + fc.FragmentLength,
            fc.FunctionName?.Value,
            new Dictionary<string, object?> {
                ["name"] = QuotedFunctionName(fc.FunctionName),
                // UDT static: geography::STGeomFromText — separator is "::"
                // XML/instance method: Data.value() — separator is "."
                // Expression method: @g.STDistance() — ExpressionCallTarget, separator is "."
                ["callTarget"] = fc.CallTarget is UserDefinedTypeCallTarget udt
                    ? (object?)(QuotedName(udt.SchemaObjectName?.Identifiers?.LastOrDefault()) ?? RawText(fc.CallTarget).Trim())
                    : fc.CallTarget is MultiPartIdentifierCallTarget mpit
                        ? (object?)string.Join(".", mpit.MultiPartIdentifier?.Identifiers.Select(i => QuotedName(i) ?? i.Value) ?? [])
                        : null,
                ["callTargetExpr"] = fc.CallTarget is ExpressionCallTarget ect
                    ? (object?)BuildScalarExpression(ect.Expression)
                    : null,
                ["callTargetSeparator"] = fc.CallTarget is MultiPartIdentifierCallTarget || fc.CallTarget is ExpressionCallTarget ? (object?)"." : "::",
                ["args"] = args,
                ["over"] = overClause,
                ["uniqueRowFilter"] = fc.UniqueRowFilter.ToString(),
                ["nulls"] = nullsModifier,
                ["trimOptions"] = trimOptions,
                ["jsonParams"] = jsonParams,
                ["nullOnNull"] = nullOnNull,
                ["jsonOrderBy"] = jsonOrderBy,
                ["withinGroup"] = withinGroup,
            });
    }

    /// <summary>
    /// Emit a FunctionCall node for built-in functions that ScriptDom represents as dedicated
    /// subtypes rather than <see cref="FunctionCall"/> (e.g. LeftFunctionCall, RightFunctionCall).
    /// The name is stored lowercase so the TS printer's keyword() normalises it correctly.
    /// </summary>
    private static SqlNode BuildBuiltinCall(string name, TSqlFragment f, IList<ScalarExpression>? parameters) {
        var args = parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        return new SqlNode(
            "FunctionCall",
            f.StartOffset,
            f.StartOffset + f.FragmentLength,
            name,
            new Dictionary<string, object?> {
                ["name"] = name,
                ["args"] = args,
                ["uniqueRowFilter"] = "NotSpecified",
            });
    }

    private static SqlNode BuildJsonKeyValue(JsonKeyValue kv) =>
        Node("JsonKeyValue", kv, new Dictionary<string, object?> {
            ["key"] = BuildScalarExpression(kv.JsonKeyName),
            ["value"] = BuildScalarExpression(kv.JsonValue),
        });

    private static string ParameterlessCallKeyword(ParameterlessCallType t) => t switch {
        ParameterlessCallType.CurrentUser => "CURRENT_USER",
        ParameterlessCallType.SessionUser => "SESSION_USER",
        ParameterlessCallType.SystemUser => "SYSTEM_USER",
        ParameterlessCallType.CurrentTimestamp => "CURRENT_TIMESTAMP",
        ParameterlessCallType.CurrentDate => "CURRENT_DATE",
        _ => "USER",
    };

    private static SqlNode BuildPartitionFunctionCall(PartitionFunctionCall pfc) {
        var args = pfc.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        return Node("PartitionFunctionCall", pfc, new Dictionary<string, object?> {
            ["database"] = QuotedName(pfc.DatabaseName),
            ["name"] = pfc.FunctionName?.Value,
            ["args"] = args,
        });
    }

    private static SqlNode BuildIdentityFunctionCall(IdentityFunctionCall ifc) =>
        Node("IdentityFunctionCall", ifc, new Dictionary<string, object?> {
            ["dataType"] = RawTextOrNull(ifc.DataType),
            ["seed"] = BuildScalarExpression(ifc.Seed),
            ["increment"] = BuildScalarExpression(ifc.Increment),
        });

    private static SqlNode BuildExtractFrom(ExtractFromExpression ext) =>
        Node("ExtractFromExpression", ext, new Dictionary<string, object?> {
            ["element"] = ext.ExtractedElement?.Value,
            ["expression"] = BuildScalarExpression(ext.Expression),
        });

    private static SqlNode BuildNextValueFor(NextValueForExpression nv) =>
        Node("NextValueFor", nv, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(nv.SequenceName),
            ["over"] = nv.OverClause != null ? BuildOverClause(nv.OverClause) : null,
        });

    private static SqlNode BuildParseCallNode(ScalarExpression expr, bool isTry) {
        ScalarExpression? value; DataTypeReference? dataType; ScalarExpression? culture;
        if (isTry) { var tpc = (TryParseCall)expr; value = tpc.StringValue; dataType = tpc.DataType; culture = tpc.Culture; } else { var pc = (ParseCall)expr; value = pc.StringValue; dataType = pc.DataType; culture = pc.Culture; }
        return Node(isTry ? "TryParseCall" : "ParseCall", expr, new Dictionary<string, object?> {
            ["value"] = BuildScalarExpression(value),
            ["dataType"] = DataTypeText(dataType),
            ["isUdt"] = UdtFlag(dataType),
            ["culture"] = culture != null ? BuildScalarExpression(culture) : null,
        });
    }

    private static SqlNode BuildTableSample(TableSampleClause ts) =>
        Node("TableSample", ts, new Dictionary<string, object?> {
            ["system"] = ts.System ? (object?)true : null,
            ["sampleNumber"] = BuildScalarExpression(ts.SampleNumber),
            ["option"] = ts.TableSampleClauseOption == TableSampleClauseOption.NotSpecified ? null : ts.TableSampleClauseOption.ToString(),
            ["repeatSeed"] = ts.RepeatSeed != null ? BuildScalarExpression(ts.RepeatSeed) : null,
        });

    private static SqlNode BuildTemporalClause(TemporalClause tc) =>
        Node("TemporalClause", tc, new Dictionary<string, object?> {
            ["clauseType"] = tc.TemporalClauseType.ToString(),
            ["startTime"] = BuildScalarExpression(tc.StartTime),
            ["endTime"] = tc.EndTime != null ? BuildScalarExpression(tc.EndTime) : null,
        });

    private static SqlNode BuildForClause(ForClause fc) {
        if (fc is XmlForClause xml) {
            var options = xml.Options?.Select(o => (object?)new Dictionary<string, object?> {
                ["kind"] = o.OptionKind.ToString(),
                ["value"] = o.Value?.Value,
            }).ToList();
            return Node("ForXmlClause", fc, new Dictionary<string, object?> { ["options"] = options });
        }
        if (fc is JsonForClause json) {
            var options = json.Options?.Select(o => (object?)new Dictionary<string, object?> {
                ["kind"] = o.OptionKind.ToString(),
                ["value"] = o.Value?.Value,
            }).ToList();
            return Node("ForJsonClause", fc, new Dictionary<string, object?> { ["options"] = options });
        }
        if (fc is BrowseForClause) return Node("ForBrowseClause", fc, new Dictionary<string, object?>());
        if (fc is ReadOnlyForClause) return Node("ForReadOnlyClause", fc, new Dictionary<string, object?>());
        if (fc is UpdateForClause upd) {
            var cols = upd.Columns?.Select(c => (object?)(QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? "")).ToList();
            return Node("ForUpdateClause", fc, new Dictionary<string, object?> { ["columns"] = cols });
        }
        return Leaf("ForClause", fc, RawText(fc));
    }

    private static SqlNode BuildPivotedTableRef(PivotedTableReference piv) {
        var inColumns = piv.InColumns?.Select(c => (object?)(c.Value ?? "")).ToList();
        var valueColumns = piv.ValueColumns?.Select(c =>
            (object?)(QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? "")).ToList();
        return Node("PivotedTableReference", piv, new Dictionary<string, object?> {
            ["tableRef"] = BuildTableReference(piv.TableReference),
            ["aggregateFn"] = QuotedName(piv.AggregateFunctionIdentifier?.Identifiers?.LastOrDefault()),
            ["valueColumns"] = valueColumns,
            ["pivotColumn"] = QuotedName(piv.PivotColumn?.MultiPartIdentifier?.Identifiers?.LastOrDefault()),
            ["inColumns"] = inColumns,
            ["alias"] = QuotedName(piv.Alias),
        });
    }

    private static SqlNode BuildUnpivotedTableRef(UnpivotedTableReference unpiv) {
        var inColumns = unpiv.InColumns?.Select(c =>
            (object?)(QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? "")).ToList();
        return Node("UnpivotedTableReference", unpiv, new Dictionary<string, object?> {
            ["tableRef"] = BuildTableReference(unpiv.TableReference),
            ["valueColumn"] = QuotedName(unpiv.ValueColumn),
            ["pivotColumn"] = QuotedName(unpiv.PivotColumn),
            ["inColumns"] = inColumns,
            ["alias"] = QuotedName(unpiv.Alias),
        });
    }

    private static SqlNode BuildInlineDerivedTable(InlineDerivedTable idt) {
        var rows = idt.RowValues?.Select(rv => {
            var values = rv.ColumnValues?.Select(v => (object?)BuildScalarExpression(v)).ToList();
            return (object?)Node("ValuesRow", rv, new Dictionary<string, object?> { ["values"] = values });
        }).ToList();
        var alias = QuotedName(idt.Alias);
        var columns = idt.Columns?.Select(c => (object?)(QuotedName(c) ?? "")).ToList();
        return Node("InlineDerivedTable", idt, new Dictionary<string, object?> {
            ["rows"] = rows,
            ["alias"] = alias,
            ["columns"] = columns,
        });
    }

    private static SqlNode BuildBinaryExpr(BinaryExpression bin) =>
        Node("BinaryExpression", bin, new Dictionary<string, object?> {
            ["operator"] = bin.BinaryExpressionType.ToString(),
            ["left"] = BuildScalarExpression(bin.FirstExpression),
            ["right"] = BuildScalarExpression(bin.SecondExpression),
        });

    private static SqlNode BuildUnaryExpr(UnaryExpression un) =>
        Node("UnaryExpression", un, new Dictionary<string, object?> {
            ["operator"] = un.UnaryExpressionType.ToString(),
            ["expr"] = BuildScalarExpression(un.Expression),
        });

    private static SqlNode BuildParenExpr(ParenthesisExpression paren) =>
        Node("ParenthesisExpression", paren, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(paren.Expression),
        });

    private static SqlNode BuildCaseExpr(CaseExpression caseExpr) {
        if (caseExpr is SimpleCaseExpression simple) {
            return Node("CaseExpression", simple, new Dictionary<string, object?> {
                ["caseType"] = "simple",
                ["input"] = BuildScalarExpression(simple.InputExpression),
                ["whens"] = simple.WhenClauses?.Select(w => (object?)Node("WhenClause", w, new Dictionary<string, object?> {
                    ["when"] = BuildScalarExpression(w.WhenExpression),
                    ["then"] = BuildScalarExpression(w.ThenExpression),
                })).ToList(),
                ["else"] = BuildScalarExpression(simple.ElseExpression),
            });
        } else {
            // SearchedCaseExpression is the only other concrete subtype of CaseExpression.
            var searched = (SearchedCaseExpression)caseExpr;
            return Node("CaseExpression", searched, new Dictionary<string, object?> {
                ["caseType"] = "searched",
                ["whens"] = searched.WhenClauses?.Select(w => (object?)Node("WhenClause", w, new Dictionary<string, object?> {
                    ["when"] = BuildBooleanExpression(w.WhenExpression),
                    ["then"] = BuildScalarExpression(w.ThenExpression),
                })).ToList(),
                ["else"] = BuildScalarExpression(searched.ElseExpression),
            });
        }
    }

    /// <summary>
    /// A data type as text. A user-defined or alias type is an identifier — schema kept, bracketed
    /// where needed, and flagged so the printer leaves its case alone; a built-in type is a keyword.
    /// </summary>
    private static string? DataTypeText(DataTypeReference? dt) =>
        dt is UserDataTypeReference { Name: not null } udt ? SchemaObjectText(udt.Name) : RawTextOrNull(dt);

    private static object? UdtFlag(DataTypeReference? dt) => dt is UserDataTypeReference ? (object?)true : null;

    private static SqlNode BuildCastCall(CastCall cast) =>
        Node("CastCall", cast, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(cast.Parameter),
            ["dataType"] = DataTypeText(cast.DataType),
            ["isUdt"] = UdtFlag(cast.DataType),
        });

    private static SqlNode BuildConvertCall(ConvertCall conv) =>
        Node("ConvertCall", conv, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(conv.Parameter),
            ["dataType"] = DataTypeText(conv.DataType),
            ["isUdt"] = UdtFlag(conv.DataType),
            ["style"] = BuildScalarExpression(conv.Style),
        });

    private static SqlNode BuildIIfCall(IIfCall iif) =>
        Node("IIfCall", iif, new Dictionary<string, object?> {
            ["condition"] = BuildBooleanExpression(iif.Predicate),
            ["trueVal"] = BuildScalarExpression(iif.ThenExpression),
            ["falseVal"] = BuildScalarExpression(iif.ElseExpression),
        });

    private static SqlNode BuildCoalesceExpr(CoalesceExpression coalesce) =>
        Node("CoalesceExpression", coalesce, new Dictionary<string, object?> {
            ["args"] = coalesce.Expressions?.Select(e => (object?)BuildScalarExpression(e)).ToList(),
        });

    private static SqlNode BuildNullIfExpr(NullIfExpression nullif) =>
        Node("NullIfExpression", nullif, new Dictionary<string, object?> {
            ["first"] = BuildScalarExpression(nullif.FirstExpression),
            ["second"] = BuildScalarExpression(nullif.SecondExpression),
        });

    private static SqlNode BuildTryCastCall(TryCastCall tryCast) =>
        Node("TryCastCall", tryCast, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(tryCast.Parameter),
            ["dataType"] = DataTypeText(tryCast.DataType),
            ["isUdt"] = UdtFlag(tryCast.DataType),
        });

    private static SqlNode BuildTryConvertCall(TryConvertCall tryConv) =>
        Node("TryConvertCall", tryConv, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(tryConv.Parameter),
            ["dataType"] = DataTypeText(tryConv.DataType),
            ["isUdt"] = UdtFlag(tryConv.DataType),
            ["style"] = BuildScalarExpression(tryConv.Style),
        });

    private static SqlNode BuildAtTimeZoneCall(AtTimeZoneCall atz) =>
        Node("AtTimeZoneCall", atz, new Dictionary<string, object?> {
            ["source"] = BuildScalarExpression(atz.DateValue),
            ["timeZone"] = BuildScalarExpression(atz.TimeZone),
        });

    private static SqlNode BuildScalarSubquery(ScalarSubquery sub) =>
        Node("ScalarSubquery", sub, new Dictionary<string, object?> {
            ["query"] = BuildQueryExpression(sub.QueryExpression),
        });

    private static SqlNode? BuildBooleanExpression(BooleanExpression? expr) {
        if (expr == null) return null;
        return expr switch {
            BooleanComparisonExpression cmp => BuildBooleanComparison(cmp),
            BooleanBinaryExpression bin => BuildBooleanBinary(bin),
            BooleanNotExpression not => BuildBooleanNot(not),
            BooleanParenthesisExpression paren => BuildBooleanParen(paren),
            BooleanIsNullExpression isNull => BuildBooleanIsNull(isNull),
            InPredicate inPred => BuildInPredicate(inPred),
            LikePredicate like => BuildLikePredicate(like),
            ExistsPredicate exists => BuildExistsPredicate(exists),
            BooleanTernaryExpression between => BuildBetween(between),
            FullTextPredicate ftp => BuildFullTextPredicate(ftp),
            DistinctPredicate dp => BuildDistinctPredicate(dp),
            SubqueryComparisonPredicate scp => BuildSubqueryComparison(scp),
            // REGEXP_LIKE predicate — SQL Server 2025
            RegexpLikePredicate rp => Node("RegexpLikePredicate", rp, new Dictionary<string, object?> {
                ["value"] = BuildScalarExpression(rp.Text),
                ["pattern"] = BuildScalarExpression(rp.Pattern),
                ["flags"] = rp.Flags != null ? BuildScalarExpression(rp.Flags) : null,
            }),
            // GraphMatchPredicate.StartOffset starts inside MATCH(, so prepend the keyword+paren
            GraphMatchPredicate gmp => Leaf("BooleanExpression", gmp, "MATCH(" + RawText(gmp)),
            _ => Leaf("BooleanExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildBooleanComparison(BooleanComparisonExpression cmp) =>
        Node("BooleanComparison", cmp, new Dictionary<string, object?> {
            ["operator"] = cmp.ComparisonType.ToString(),
            ["left"] = BuildScalarExpression(cmp.FirstExpression),
            ["right"] = BuildScalarExpression(cmp.SecondExpression),
        });

    private static SqlNode BuildBooleanBinary(BooleanBinaryExpression bin) =>
        Node("BooleanBinary", bin, new Dictionary<string, object?> {
            ["operator"] = bin.BinaryExpressionType.ToString(),
            ["left"] = BuildBooleanExpression(bin.FirstExpression),
            ["right"] = BuildBooleanExpression(bin.SecondExpression),
        });

    private static SqlNode BuildBooleanNot(BooleanNotExpression not) =>
        Node("BooleanNot", not, new Dictionary<string, object?> {
            ["expr"] = BuildBooleanExpression(not.Expression),
        });

    private static SqlNode BuildBooleanParen(BooleanParenthesisExpression paren) =>
        Node("BooleanParenthesis", paren, new Dictionary<string, object?> {
            ["expr"] = BuildBooleanExpression(paren.Expression),
        });

    private static SqlNode BuildBooleanIsNull(BooleanIsNullExpression isNull) =>
        Node("IsNullExpression", isNull, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(isNull.Expression),
            ["isNot"] = isNull.IsNot,
        });

    private static SqlNode BuildDistinctPredicate(DistinctPredicate dp) =>
        Node("DistinctPredicate", dp, new Dictionary<string, object?> {
            ["left"] = BuildScalarExpression(dp.FirstExpression),
            ["right"] = BuildScalarExpression(dp.SecondExpression),
            ["isNot"] = dp.IsNot,
        });

    private static SqlNode BuildSubqueryComparison(SubqueryComparisonPredicate scp) =>
        Node("SubqueryComparisonPredicate", scp, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(scp.Expression),
            ["operator"] = scp.ComparisonType.ToString(),
            ["quantifier"] = scp.SubqueryComparisonPredicateType == SubqueryComparisonPredicateType.None
                ? null
                : scp.SubqueryComparisonPredicateType.ToString().ToUpper(),
            ["subquery"] = BuildQueryExpression(scp.Subquery?.QueryExpression),
        });

    private static SqlNode BuildInPredicate(InPredicate inPred) =>
        Node("InPredicate", inPred, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(inPred.Expression),
            ["negated"] = inPred.NotDefined,
            ["values"] = inPred.Values?.Select(v => (object?)BuildScalarExpression(v)).ToList(),
            ["subquery"] = inPred.Subquery != null ? BuildQueryExpression(inPred.Subquery.QueryExpression) : null,
        });

    private static SqlNode BuildLikePredicate(LikePredicate like) =>
        Node("LikePredicate", like, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(like.FirstExpression),
            ["pattern"] = BuildScalarExpression(like.SecondExpression),
            ["negated"] = like.NotDefined,
            ["escape"] = BuildScalarExpression(like.EscapeExpression),
        });

    private static SqlNode BuildExistsPredicate(ExistsPredicate exists) =>
        Node("ExistsPredicate", exists, new Dictionary<string, object?> {
            ["subquery"] = BuildQueryExpression(exists.Subquery?.QueryExpression),
        });

    private static SqlNode BuildBetween(BooleanTernaryExpression between) =>
        Node("BetweenExpression", between, new Dictionary<string, object?> {
            ["expr"] = BuildScalarExpression(between.FirstExpression),
            ["from"] = BuildScalarExpression(between.SecondExpression),
            ["to"] = BuildScalarExpression(between.ThirdExpression),
            ["negated"] = between.TernaryExpressionType == BooleanTernaryExpressionType.NotBetween,
        });

    private static SqlNode? BuildTableReference(TableReference? tableRef) {
        if (tableRef == null) return null;
        return tableRef switch {
            NamedTableReference named => BuildNamedTableRef(named),
            VariableTableReference varRef => Node("VariableTableReference", varRef, new Dictionary<string, object?> {
                ["name"] = varRef.Variable?.Name,
                ["alias"] = QuotedName(varRef.Alias),
            }),
            QualifiedJoin qj => BuildQualifiedJoin(qj),
            UnqualifiedJoin uj => BuildUnqualifiedJoin(uj),
            QueryDerivedTable sub => BuildQueryDerivedTable(sub),
            JoinParenthesisTableReference jp => BuildJoinParenthesis(jp),
            SchemaObjectFunctionTableReference tvf => BuildSchemaObjectFunctionTableRef(tvf),
            FullTextTableReference ftt => BuildFullTextTableReference(ftt),
            OpenXmlTableReference openXml => BuildOpenXmlTableReference(openXml),
            OpenJsonTableReference openJson => BuildOpenJsonTableReference(openJson),
            OpenRowsetTableReference or => BuildOpenRowsetTableReference(or),
            BulkOpenRowset bulkOr => BuildBulkOpenRowset(bulkOr),
            PivotedTableReference piv => BuildPivotedTableRef(piv),
            UnpivotedTableReference unpiv => BuildUnpivotedTableRef(unpiv),
            InlineDerivedTable idt => BuildInlineDerivedTable(idt),
            // Built-in TVFs: STRING_SPLIT, GENERATE_SERIES, OPENDATASOURCE etc.
            BuiltInFunctionTableReference bif => BuildBuiltinTableRef(bif, bif.Name?.Value, bif.Parameters, bif.Alias),
            // ::GlobalFunctionName() CLR global functions
            GlobalFunctionTableReference gf => BuildBuiltinTableRef(gf, gf.Name?.Value, gf.Parameters, gf.Alias),
            // OPENQUERY(linkedServer, 'sql')
            OpenQueryTableReference oq => Node("OpenQueryTableReference", oq, new Dictionary<string, object?> {
                ["linkedServer"] = oq.LinkedServer?.Value,
                ["query"] = oq.Query?.Value,
                ["alias"] = QuotedName(oq.Alias),
            }),
            _ => Leaf("TableReference", tableRef, RawText(tableRef)),
        };
    }

    private static SqlNode BuildNamedTableRef(NamedTableReference named) {
        var hints = MapList(named.TableHints, h => {
            // INDEX hints carry index names/ids — serialize as "INDEX = name" or "INDEX(n1,n2)"
            if (h is IndexTableHint idxHint && idxHint.IndexValues?.Count > 0) {
                var vals = idxHint.IndexValues.Select(v =>
                    v.Identifier != null ? QuotedName(v.Identifier) : v.Value ?? "");
                return (object?)(idxHint.IndexValues.Count == 1
                    ? $"INDEX = {vals.First()}"
                    : $"INDEX({string.Join(", ", vals)})");
            }
            // FORCESEEK with optional index and column list: FORCESEEK(index_name(col1,col2))
            if (h is ForceSeekTableHint fsHint && fsHint.IndexValue != null) {
                var idxName = fsHint.IndexValue.Identifier != null
                    ? QuotedName(fsHint.IndexValue.Identifier)
                    : fsHint.IndexValue.Value ?? "";
                if (fsHint.ColumnValues?.Count > 0) {
                    var cols = fsHint.ColumnValues.Select(cv =>
                        QuotedName(cv.MultiPartIdentifier?.Identifiers.LastOrDefault()) ?? "");
                    return (object?)$"FORCESEEK({idxName}({string.Join(", ", cols)}))";
                }
                return (object?)$"FORCESEEK({idxName})";
            }
            return (object?)h.HintKind.ToString().ToUpper();
        });
        return Node("NamedTableReference", named, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(named.SchemaObject),
            ["alias"] = QuotedName(named.Alias),
            ["hints"] = hints,
            ["tableSample"] = named.TableSampleClause != null ? BuildTableSample(named.TableSampleClause) : null,
            ["temporal"] = named.TemporalClause != null ? BuildTemporalClause(named.TemporalClause) : null,
        });
    }

    private static SqlNode BuildQualifiedJoin(QualifiedJoin qj) =>
        Node("QualifiedJoin", qj, new Dictionary<string, object?> {
            ["joinType"] = qj.QualifiedJoinType.ToString(),
            ["joinHint"] = qj.JoinHint == JoinHint.None ? null : qj.JoinHint.ToString().ToUpper(),
            ["left"] = BuildTableReference(qj.FirstTableReference),
            ["right"] = BuildTableReference(qj.SecondTableReference),
            ["condition"] = BuildBooleanExpression(qj.SearchCondition),
        });

    private static SqlNode BuildUnqualifiedJoin(UnqualifiedJoin uj) =>
        Node("UnqualifiedJoin", uj, new Dictionary<string, object?> {
            ["joinType"] = uj.UnqualifiedJoinType.ToString(),
            ["left"] = BuildTableReference(uj.FirstTableReference),
            ["right"] = BuildTableReference(uj.SecondTableReference),
        });

    private static SqlNode BuildJoinParenthesis(JoinParenthesisTableReference jp) =>
        Node("JoinParenthesisTableReference", jp, new Dictionary<string, object?> {
            ["join"] = BuildTableReference(jp.Join),
        });

    private static SqlNode BuildQueryDerivedTable(QueryDerivedTable sub) =>
        Node("QueryDerivedTable", sub, new Dictionary<string, object?> {
            ["query"] = BuildQueryExpression(sub.QueryExpression),
            ["alias"] = QuotedName(sub.Alias),
            // (SELECT ...) AS s (a, b): names for the derived table's columns
            ["columns"] = MapList(sub.Columns, c => (object?)QuotedName(c)),
        });

    private static SqlNode BuildSchemaObjectFunctionTableRef(SchemaObjectFunctionTableReference tvf) {
        var args = tvf.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        // e.g. `t.x.nodes('/r') AS n(x)` — the alias's column list (for xml .nodes()).
        var columns = tvf.Columns?.Select(c => (object?)QuotedName(c)).ToList();
        return Node("SchemaObjectFunctionTableReference", tvf, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(tvf.SchemaObject),
            ["args"] = args,
            ["alias"] = QuotedName(tvf.Alias),
            ["aliasColumns"] = columns?.Count > 0 ? columns : null,
        });
    }

    /// <summary>
    /// Built-in TVFs (STRING_SPLIT, GENERATE_SERIES, etc.) and CLR global functions
    /// are represented as dedicated ScriptDom types rather than SchemaObjectFunctionTableReference.
    /// Emit them with a bare string name so the TS printer can keyword()-normalize the casing.
    /// </summary>
    private static SqlNode BuildBuiltinTableRef(TSqlFragment f, string? name, IList<ScalarExpression>? parameters, Identifier? alias) {
        var args = parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        return Node("BuiltInFunctionTableReference", f, new Dictionary<string, object?> {
            ["name"] = name,
            ["args"] = args,
            ["alias"] = QuotedName(alias),
        });
    }

    private static SqlNode? BuildQueryExpression(QueryExpression? expr) {
        if (expr == null) return null;
        return expr switch {
            QuerySpecification qs => BuildQuerySpec(qs),
            BinaryQueryExpression bq => BuildBinaryQuery(bq),
            QueryParenthesisExpression qp => BuildQueryParen(qp),
            _ => Leaf("QueryExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildQuerySpec(QuerySpecification qs) {
        var selectElements = qs.SelectElements?.Select(se => (object?)BuildSelectElement(se)).ToList();
        var topRowFilter = qs.TopRowFilter != null ? BuildTopRowFilter(qs.TopRowFilter) : null;
        var fromClause = qs.FromClause != null ? BuildFromClause(qs.FromClause) : null;
        var whereClause = qs.WhereClause != null ? BuildBooleanExpression(qs.WhereClause.SearchCondition) : null;
        var groupByClause = qs.GroupByClause != null ? BuildGroupByClause(qs.GroupByClause) : null;
        var havingClause = qs.HavingClause != null ? BuildBooleanExpression(qs.HavingClause.SearchCondition) : null;
        var orderByClause = qs.OrderByClause != null ? BuildOrderByClause(qs.OrderByClause) : null;
        var windowClause = BuildWindowClause(qs.WindowClause);
        var uniqueRowFilter = qs.UniqueRowFilter.ToString();
        var forClause = qs.ForClause != null ? BuildForClause(qs.ForClause) : null;

        return Node("QuerySpecification", qs, new Dictionary<string, object?> {
            ["uniqueRowFilter"] = uniqueRowFilter,
            ["top"] = topRowFilter,
            ["selectElements"] = selectElements,
            ["from"] = fromClause,
            ["where"] = whereClause,
            ["groupBy"] = groupByClause,
            ["having"] = havingClause,
            ["orderBy"] = orderByClause,
            ["windowDefs"] = windowClause,
            ["forClause"] = forClause,
            ["offset"] = qs.OffsetClause?.OffsetExpression != null ? BuildScalarExpression(qs.OffsetClause.OffsetExpression) : null,
            ["fetch"] = qs.OffsetClause?.FetchExpression != null ? BuildScalarExpression(qs.OffsetClause.FetchExpression) : null,
        });
    }

    private static SqlNode BuildTopRowFilter(TopRowFilter top) {
        // TOP (n) — ScriptDom stores expression as ParenthesisExpression; unwrap to avoid double parens in output
        var expr = top.Expression is ParenthesisExpression pe ? pe.Expression : top.Expression;
        return Node("TopRowFilter", top, new Dictionary<string, object?> {
            ["expression"] = BuildScalarExpression(expr),
            ["percent"] = top.Percent,
            ["withTies"] = top.WithTies,
        });
    }

    private static SqlNode? BuildSelectElement(SelectElement se) => se switch {
        SelectStarExpression star => Leaf("SelectStar", star, RawText(star)),
        SelectScalarExpression scalar => Node("SelectScalar", scalar, new Dictionary<string, object?> {
            ["expression"] = BuildScalarExpression(scalar.Expression),
            ["alias"] = scalar.ColumnName?.Identifier != null
                ? QuotedName(scalar.ColumnName.Identifier)
                : QuotedName(scalar.ColumnName),
        }),
        SelectSetVariable sv => Node("SelectSetVariable", sv, new Dictionary<string, object?> {
            ["variable"] = sv.Variable?.Name,
            ["operator"] = sv.AssignmentKind.ToString(),
            ["value"] = BuildScalarExpression(sv.Expression),
        }),
        _ => Leaf("SelectElement", se, RawText(se)),
    };

    private static SqlNode BuildFromClause(FromClause fc) {
        var tableRefs = fc.TableReferences?.Select(tr => (object?)BuildTableReference(tr)).ToList();
        return Node("FromClause", fc, new Dictionary<string, object?> {
            ["tableReferences"] = tableRefs,
        });
    }

    private static SqlNode BuildGroupByClause(GroupByClause gb) {
        var elements = gb.GroupingSpecifications?.Select(gs => (object?)BuildGroupingSpec(gs)).ToList();
        return Node("GroupByClause", gb, new Dictionary<string, object?> {
            ["elements"] = elements,
            // GROUP BY ALL: include groups the WHERE clause filtered out
            ["all"] = gb.All ? true : null,
            // Legacy GROUP BY a WITH ROLLUP / WITH CUBE
            ["withOption"] = gb.GroupByOption switch {
                GroupByOption.Rollup => "WITH ROLLUP",
                GroupByOption.Cube   => "WITH CUBE",
                _                    => null,
            },
        });
    }

    private static SqlNode? BuildGroupingSpec(GroupingSpecification gs) => gs switch {
        ExpressionGroupingSpecification expr => BuildScalarExpression(expr.Expression),
        RollupGroupingSpecification rollup => Node("RollupSpec", rollup, new Dictionary<string, object?> { ["expressions"] = rollup.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        CubeGroupingSpecification cube => Node("CubeSpec", cube, new Dictionary<string, object?> { ["expressions"] = cube.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        GroupingSetsGroupingSpecification gsets => Node("GroupingSetsSpec", gsets, new Dictionary<string, object?> { ["sets"] = gsets.Sets?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        CompositeGroupingSpecification composite => Node("CompositeGroupingSpec", composite, new Dictionary<string, object?> { ["items"] = composite.Items?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        GrandTotalGroupingSpecification => Leaf("GrandTotalSpec", gs, "()"),
        _ => Leaf("GroupingSpecification", gs, RawText(gs)),
    };

    private static SqlNode BuildOrderByClause(OrderByClause ob) {
        var elements = ob.OrderByElements?.Select(e => (object?)BuildOrderByElement(e)).ToList();
        return Node("OrderByClause", ob, new Dictionary<string, object?> {
            ["elements"] = elements,
        });
    }

    private static SqlNode BuildOrderByElement(ExpressionWithSortOrder e) =>
        Node("OrderByElement", e, new Dictionary<string, object?> {
            ["expression"] = BuildScalarExpression(e.Expression),
            ["sortOrder"] = e.SortOrder.ToString(),
        });

    private static SqlNode BuildBinaryQuery(BinaryQueryExpression bq) =>
        Node("BinaryQueryExpression", bq, new Dictionary<string, object?> {
            ["operator"] = bq.BinaryQueryExpressionType.ToString(),
            ["all"] = bq.All,
            ["left"] = BuildQueryExpression(bq.FirstQueryExpression),
            ["right"] = BuildQueryExpression(bq.SecondQueryExpression),
            ["orderBy"] = bq.OrderByClause != null ? BuildOrderByClause(bq.OrderByClause) : null,
            ["offset"] = bq.OffsetClause?.OffsetExpression != null ? BuildScalarExpression(bq.OffsetClause.OffsetExpression) : null,
            ["fetch"] = bq.OffsetClause?.FetchExpression != null ? BuildScalarExpression(bq.OffsetClause.FetchExpression) : null,
        });

    private static SqlNode BuildQueryParen(QueryParenthesisExpression qp) =>
        Node("QueryParenthesis", qp, new Dictionary<string, object?> {
            ["query"] = BuildQueryExpression(qp.QueryExpression),
        });

    private static SqlNode BuildOverClause(OverClause over) {
        var partitionBy = over.Partitions?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var orderBy = over.OrderByClause != null ? BuildOrderByClause(over.OrderByClause) : null;
        // Named window reference: OVER (window_name) — SQL Server 2022+
        string? windowName = QuotedName(over.WindowName);
        return Node("OverClause", over, new Dictionary<string, object?> {
            ["partitionBy"] = partitionBy,
            ["orderBy"] = orderBy,
            ["windowName"] = windowName,
            ["frame"] = over.WindowFrameClause != null ? BuildWindowFrame(over.WindowFrameClause) : null,
        });
    }

    private static SqlNode BuildWindowFrame(WindowFrameClause frame) =>
        Node("WindowFrame", frame, new Dictionary<string, object?> {
            ["frameType"] = frame.WindowFrameType.ToString(),
            ["top"] = BuildWindowDelimiter(frame.Top),
            ["bottom"] = frame.Bottom != null ? BuildWindowDelimiter(frame.Bottom) : null,
        });

    private static SqlNode BuildWindowDelimiter(WindowDelimiter delim) =>
        Node("WindowDelimiter", delim, new Dictionary<string, object?> {
            ["delimType"] = delim.WindowDelimiterType.ToString(),
            ["offset"] = delim.OffsetValue != null ? BuildScalarExpression(delim.OffsetValue) : null,
        });

    private static SqlNode BuildWindowDefinition(WindowDefinition wd) {
        var partitionBy = wd.Partitions?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var orderBy = wd.OrderByClause != null ? BuildOrderByClause(wd.OrderByClause) : null;
        return Node("WindowDefinition", wd, new Dictionary<string, object?> {
            ["name"] = QuotedName(wd.WindowName),
            ["refWindowName"] = QuotedName(wd.RefWindowName),
            ["partitionBy"] = partitionBy,
            ["orderBy"] = orderBy,
            ["frame"] = wd.WindowFrameClause != null ? BuildWindowFrame(wd.WindowFrameClause) : null,
        });
    }

    private static List<object?>? BuildWindowClause(WindowClause? wc) {
        if (wc?.WindowDefinition == null || wc.WindowDefinition.Count == 0) return null;
        return wc.WindowDefinition.Select(wd => (object?)BuildWindowDefinition(wd)).ToList();
    }

    // -------------------------------------------------------------------------
    // Visitor overrides — we handle at the statement level
    // -------------------------------------------------------------------------

    public override void Visit(TSqlScript script) {
        _stmtLimit = new Dictionary<TSqlStatement, int>(ReferenceEqualityComparer.Instance);
        script.Accept(new StatementLimitIndexer(_stmtLimit));
        var batches = script.Batches?.Select(b => (object?)BuildBatch(b)).ToList();
        Root = Node("TSqlScript", script, new Dictionary<string, object?> {
            ["batches"] = batches,
        });
    }

    /// <summary>
    /// For each statement, the token index where the next statement (or the end of its batch)
    /// begins. ScriptDom gives some statement kinds a fragment that stops short of their last
    /// tokens (CREATE EXTERNAL LANGUAGE ... FROM (...) ends before the FROM clause), so a
    /// statement printed from its own text needs to know where it really ends.
    /// </summary>
    [ThreadStatic] private static Dictionary<TSqlStatement, int>? _stmtLimit;

    private sealed class StatementLimitIndexer(Dictionary<TSqlStatement, int> limits) : TSqlFragmentVisitor {
        private void Index(IList<TSqlStatement>? statements, int lastLimit) {
            if (statements == null) return;
            for (var i = 0; i < statements.Count; i++) {
                if (i + 1 < statements.Count) limits[statements[i]] = statements[i + 1].FirstTokenIndex;
                else if (lastLimit >= 0) limits[statements[i]] = lastLimit;
            }
        }
        public override void ExplicitVisit(TSqlBatch node) {
            // The last statement of a batch runs to the next GO or the end of the script
            Index(node.Statements, node.ScriptTokenStream?.Count ?? -1);
            base.ExplicitVisit(node);
        }
        public override void ExplicitVisit(StatementList node) {
            Index(node.Statements, -1);
            base.ExplicitVisit(node);
        }
    }

    /// <summary>
    /// A statement kept as its source text. Extends past the end of the statement's own
    /// fragment when real tokens follow it before the next statement (see <see cref="_stmtLimit"/>).
    /// </summary>
    private static SqlNode LeafStatement(TSqlStatement stmt) {
        var stream = stmt.ScriptTokenStream;
        if (stream == null || stmt.FirstTokenIndex < 0 || _stmtLimit == null || !_stmtLimit.TryGetValue(stmt, out var limit))
            return Leaf("Statement", stmt, RawText(stmt));
        var last = Math.Min(stmt.LastTokenIndex, stream.Count - 1);
        var end = last;
        for (var i = last + 1; i < Math.Min(limit, stream.Count); i++) {
            var type = stream[i].TokenType;
            if (type is TSqlTokenType.Go or TSqlTokenType.EndOfFile) break;
            if (type is TSqlTokenType.WhiteSpace or TSqlTokenType.Semicolon
                or TSqlTokenType.SingleLineComment or TSqlTokenType.MultilineComment) continue;
            end = i;
        }
        if (end == last) return Leaf("Statement", stmt, RawText(stmt));
        var sb = new StringBuilder();
        for (var i = stmt.FirstTokenIndex; i <= end; i++) sb.Append(stream[i].Text);
        return new SqlNode("Statement", stmt.StartOffset, stream[end].Offset + stream[end].Text.Length, sb.ToString().Trim(), null);
    }

    private static SqlNode BuildBatch(TSqlBatch batch) {
        var stmts = batch.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("TSqlBatch", batch, new Dictionary<string, object?> {
            ["statements"] = stmts,
        });
    }

    private static SqlNode? BuildStatement(TSqlStatement stmt) {
        if (stmt == null) return null;
        return stmt switch {
            // DML
            SelectStatement sel => BuildSelectStatement(sel),
            InsertStatement ins => BuildInsertStatement(ins),
            UpdateStatement upd => BuildUpdateStatement(upd),
            DeleteStatement del => BuildDeleteStatement(del),
            MergeStatement merge => BuildMergeStatement(merge),

            // DDL — tables & indexes
            CreateTableStatement ct => BuildCreateTableStatement(ct),
            AlterTableStatement at => BuildAlterTableStatement(at),
            CreateIndexStatement ci => BuildCreateIndexStatement(ci),
            CreateVectorIndexStatement cvi => BuildCreateVectorIndexStatement(cvi),
            AlterIndexStatement ai => BuildAlterIndex(ai),
            DropIndexStatement di => BuildDropIndex(di),

            // DDL — procedures & functions
            CreateProcedureStatement cp => BuildCreateProcedureStatement(cp),
            CreateOrAlterProcedureStatement cap => BuildCreateOrAlterProcedure(cap),
            AlterProcedureStatement ap => BuildProcedureStatement("AlterProcedureStatement", ap),
            CreateFunctionStatement cf => BuildCreateFunctionStatement(cf),
            CreateOrAlterFunctionStatement coaf => BuildFunctionStatement("CreateOrAlterFunctionStatement", coaf),
            AlterFunctionStatement af => BuildFunctionStatement("AlterFunctionStatement", af),

            // DDL — views
            CreateViewStatement cv => BuildViewStatement("CreateViewStatement", cv),
            AlterViewStatement av => BuildViewStatement("AlterViewStatement", av),
            CreateOrAlterViewStatement coav => BuildViewStatement("CreateOrAlterViewStatement", coav),

            // DDL — triggers
            CreateTriggerStatement ctrig => BuildTriggerStatement("CreateTriggerStatement", ctrig),
            AlterTriggerStatement atrig => BuildTriggerStatement("AlterTriggerStatement", atrig),
            DropTriggerStatement dtrig => BuildDropObjects("DropTriggerStatement", dtrig),

            // DDL — sequences
            CreateSequenceStatement cseq => BuildCreateSequence(cseq),
            AlterSequenceStatement aseq => BuildAlterSequence(aseq),
            DropSequenceStatement dseq => BuildDropObjects("DropSequenceStatement", dseq),

            // DDL — partition functions & schemes
            CreatePartitionFunctionStatement cpf => BuildCreatePartitionFunction(cpf),
            AlterPartitionFunctionStatement apf => BuildAlterPartitionFunction(apf),
            DropPartitionFunctionStatement dpf => BuildDropPartitionFunction(dpf),
            CreatePartitionSchemeStatement cps => BuildCreatePartitionScheme(cps),
            AlterPartitionSchemeStatement aps => BuildAlterPartitionScheme(aps),
            DropPartitionSchemeStatement dps => BuildDropPartitionScheme(dps),

            // DDL — types & bulk insert
            BulkInsertStatement bulk => BuildBulkInsert(bulk),
            CreateTypeUddtStatement ctud => BuildCreateTypeUddt(ctud),
            CreateTypeTableStatement cttbl => BuildCreateTypeTable(cttbl),

            // DDL — DROP (shared helper)
            DropTableStatement dts => BuildDropObjects("DropTableStatement", dts),
            DropProcedureStatement dps => BuildDropObjects("DropProcedureStatement", dps),
            DropViewStatement dvs => BuildDropObjects("DropViewStatement", dvs),
            DropFunctionStatement dfs => BuildDropObjects("DropFunctionStatement", dfs),

            // DDL — synonyms
            CreateSynonymStatement csy => BuildCreateSynonym(csy),
            DropSynonymStatement dsy => BuildDropObjects("DropSynonymStatement", dsy),

            // DDL — schemas
            CreateSchemaStatement csch => BuildCreateSchema(csch),
            AlterSchemaStatement asch => BuildAlterSchema(asch),
            DropSchemaStatement dsch => BuildDropSchema(dsch),

            // BEGIN/END block — atomic variant must be listed first (it extends BeginEndBlockStatement)
            BeginEndAtomicBlockStatement atomic => BuildBeginEndAtomic(atomic),
            BeginEndBlockStatement begin => BuildBeginEnd(begin),

            // Transactions
            BeginTransactionStatement bt => BuildBeginTransaction(bt),
            CommitTransactionStatement ct => BuildCommitTransaction(ct),
            RollbackTransactionStatement rt => BuildRollbackTransaction(rt),
            SaveTransactionStatement sv => BuildSaveTransaction(sv),

            // Variable management
            DeclareVariableStatement dv => BuildDeclareVariable(dv),
            DeclareTableVariableStatement dtv => BuildDeclareTableVariable(dtv),
            SetVariableStatement sv => BuildSetVariable(sv),
            SetRowCountStatement src => BuildSetRowCount(src),

            // Operational / admin
            CheckpointStatement chk => BuildCheckpoint(chk),
            KillStatement kll => BuildKill(kll),
            ReconfigureStatement rc => BuildReconfigure(rc),

            // DDL — triggers (enable/disable)
            EnableDisableTriggerStatement et => BuildEnableDisableTrigger(et),

            // DDL — indexes (columnstore)
            CreateColumnStoreIndexStatement ccsi => BuildCreateColumnStoreIndex(ccsi),

            // Security — ALTER AUTHORIZATION
            AlterAuthorizationStatement aa => BuildAlterAuthorization(aa),

            // DDL — statistics
            CreateStatisticsStatement cstat => BuildCreateStatistics(cstat),
            UpdateStatisticsStatement ustat => BuildUpdateStatistics(ustat),
            DropStatisticsStatement dstat => BuildDropStatistics(dstat),

            // SET / USE / WAITFOR
            UseStatement use => BuildUseStatement(use),
            PredicateSetStatement ps => BuildPredicateSetStatement(ps),
            SetStatisticsStatement sst => BuildSetStatisticsStatement(sst),
            SetIdentityInsertStatement sis => BuildSetIdentityInsert(sis),
            SetTransactionIsolationLevelStatement stils => BuildSetIsolationLevel(stils),
            WaitForStatement wf => BuildWaitFor(wf),

            // Output / flow
            PrintStatement pst => BuildPrint(pst),
            ReturnStatement rs => BuildReturn(rs),
            IfStatement ifs => BuildIf(ifs),
            WhileStatement ws => BuildWhile(ws),
            ExecuteStatement es => BuildExecute(es),
            TruncateTableStatement trunc => BuildTruncateTable(trunc),
            BreakStatement brk => Leaf("BreakStatement", brk),
            ContinueStatement cont => Leaf("ContinueStatement", cont),
            GoToStatement gt => BuildGoto(gt),
            LabelStatement lbl => BuildLabel(lbl),
            ThrowStatement thr => BuildThrow(thr),
            RaiseErrorStatement raise => BuildRaiseError(raise),
            TryCatchStatement tc => BuildTryCatch(tc),

            // Cursors
            DeclareCursorStatement dcs => BuildDeclareCursor(dcs),
            OpenCursorStatement ocs => BuildOpenCursor(ocs),
            FetchCursorStatement fcs => BuildFetchCursor(fcs),
            CloseCursorStatement ccs => BuildCloseCursor(ccs),
            DeallocateCursorStatement dalc => BuildDeallocateCursor(dalc),

            // Session context
            ExecuteAsStatement ea => BuildExecuteAsStatement(ea),
            RevertStatement rv => BuildRevertStatement(rv),

            // Security — GRANT / DENY / REVOKE
            GrantStatement gs => BuildGrant(gs),
            DenyStatement dny => BuildDeny(dny),
            RevokeStatement rvk => BuildRevoke(rvk),

            // Security — USER / LOGIN / ROLE
            CreateUserStatement cus => BuildCreateUser(cus),
            AlterUserStatement aus => BuildAlterUser(aus),
            DropUserStatement dup => BuildDropUser(dup),
            CreateLoginStatement clog => BuildCreateLogin(clog),
            AlterLoginStatement alog => BuildAlterLogin(alog),
            DropLoginStatement dlog => BuildDropLogin(dlog),
            // Server roles are subtypes of the database-role statements — match first
            CreateServerRoleStatement csrol => Node("CreateRoleStatement", csrol, new Dictionary<string, object?> {
                ["name"] = QuotedName(csrol.Name),
                ["owner"] = QuotedName(csrol.Owner),
                ["isServer"] = true,
            }),
            AlterServerRoleStatement asrol => BuildAlterRole(asrol, isServer: true),
            CreateRoleStatement crol => BuildCreateRole(crol),
            AlterRoleStatement arol => BuildAlterRole(arol),
            DropRoleStatement drol => BuildDropRole(drol),

            // Database admin — DROP / DBCC / BACKUP / RESTORE / CREATE DATABASE
            DropDatabaseStatement ddb => BuildDropDatabase(ddb),
            DbccStatement dbcc => BuildDbcc(dbcc),
            BackupDatabaseStatement bkd => BuildBackupDatabase(bkd),
            BackupTransactionLogStatement bkl => BuildBackupLog(bkl),
            RestoreStatement rst => BuildRestore(rst),
            CreateDatabaseStatement cdb => BuildCreateDatabase(cdb),

            // ALTER DATABASE variants
            AlterDatabaseSetStatement adbs => BuildAlterDatabaseSet(adbs),
            AlterDatabaseCollateStatement adbc => BuildAlterDatabaseCollate(adbc),
            AlterDatabaseModifyNameStatement admn => BuildAlterDatabaseModifyName(admn),
            AlterDatabaseScopedConfigurationSetStatement adcs => BuildAlterDatabaseScopedConfigSet(adcs),
            AlterDatabaseScopedConfigurationClearStatement adcc => BuildAlterDatabaseScopedConfigClear(adcc),
            AlterDatabaseAddFileStatement adaf => BuildAlterDatabaseAddFile(adaf),
            AlterDatabaseAddFileGroupStatement adafg => BuildAlterDatabaseAddFileGroup(adafg),
            AlterDatabaseRemoveFileStatement adrf => BuildAlterDatabaseRemoveFile(adrf),
            AlterDatabaseRemoveFileGroupStatement adrfg => BuildAlterDatabaseRemoveFileGroup(adrfg),
            AlterDatabaseModifyFileStatement admf => BuildAlterDatabaseModifyFile(admf),
            AlterDatabaseModifyFileGroupStatement admfg => BuildAlterDatabaseModifyFileGroup(admfg),
            AlterDatabaseRebuildLogStatement adrl => BuildAlterDatabaseRebuildLog(adrl),

            // Extended Events — ALTER EVENT SESSION
            // ScriptDOM's AlterEventSessionStatement.FragmentLength excludes the STATE clause
            // for the STATE=START/STOP form, causing RawText to drop "STATE = START/STOP".
            // Handle it explicitly so we can reconstruct the full SQL.
            AlterEventSessionStatement aes => BuildAlterEventSession(aes),

            // Always Encrypted — CREATE/DROP COLUMN MASTER KEY, CREATE/ALTER/DROP COLUMN ENCRYPTION KEY
            CreateColumnMasterKeyStatement ccmk => BuildCreateColumnMasterKey(ccmk),
            CreateColumnEncryptionKeyStatement ccek =>
                BuildColumnEncryptionKeyStatement("CreateColumnEncryptionKeyStatement", ccek, null),
            AlterColumnEncryptionKeyStatement acek =>
                BuildColumnEncryptionKeyStatement("AlterColumnEncryptionKeyStatement", acek, acek.AlterType),
            DropColumnMasterKeyStatement dcmk => BuildDropUnownedObject("DropColumnMasterKeyStatement", dcmk),
            DropColumnEncryptionKeyStatement dcek => BuildDropUnownedObject("DropColumnEncryptionKeyStatement", dcek),

            // CREATE/ALTER/DROP EXTERNAL MODEL (SQL Server 2025 AI functions)
            CreateExternalModelStatement cem => BuildExternalModel("CreateExternalModelStatement", cem, QuotedName(cem.Owner)),
            AlterExternalModelStatement aem  => BuildExternalModel("AlterExternalModelStatement", aem, null),
            DropExternalModelStatement dem   => BuildDropUnownedObject("DropExternalModelStatement", dem),

            // Service Broker — END CONVERSATION
            // ScriptDOM's EndConversationStatement.StartOffset points at the handle variable
            // (not at the END keyword), so the raw-text fallback drops "END CONVERSATION".
            // Handle it explicitly.
            EndConversationStatement ecs => Node("EndConversationStatement", ecs, new Dictionary<string, object?> {
                ["handle"]           = ecs.Conversation != null ? RawText(ecs.Conversation) : null,
                ["withCleanup"]      = ecs.WithCleanup ? (object?)true : null,
                ["errorCode"]        = ecs.ErrorCode != null ? RawText(ecs.ErrorCode) : null,
                ["errorDescription"] = ecs.ErrorDescription != null ? RawText(ecs.ErrorDescription) : null,
            }),

            _ => LeafStatement(stmt),
        };
    }

    // -------------------------------------------------------------------------
    // DML: SELECT
    // -------------------------------------------------------------------------

    private static SqlNode BuildSelectStatement(SelectStatement sel) {
        var ctes = sel.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();

        // WITH XMLNAMESPACES — serialize each namespace element from its properties
        // so we don't rely on StartOffset (which may not point to DEFAULT/alias tokens).
        var xmlNsElems = sel.WithCtesAndXmlNamespaces?.XmlNamespaces?.XmlNamespacesElements;
        var xmlNamespaces = xmlNsElems?.Count > 0
            ? xmlNsElems.Select(e => (object?)BuildXmlNamespaceElement(e)).ToList()
            : null;

        var optimizerHints = MapList(sel.OptimizerHints, h => (object?)BuildOptimizerHint(h));
        var queryExpr = BuildQueryExpression(sel.QueryExpression);

        // SELECT INTO: inject the target table name into the QuerySpecification node so the
        // printer can place "INTO #target" between the column list and the FROM clause.
        if (sel.Into != null && queryExpr?.Props != null) {
            queryExpr.Props["into"] = BuildSchemaObjectName(sel.Into);
            // SELECT ... INTO t ON filegroup: where the new table is created
            queryExpr.Props["intoOn"] = QuotedName(sel.On);
        }

        return Node("SelectStatement", sel, new Dictionary<string, object?> {
            ["ctes"] = ctes,
            ["xmlNamespaces"] = xmlNamespaces,
            ["queryExpression"] = queryExpr,
            ["optimizerHints"] = optimizerHints,
        });
    }

    private static string BuildXmlNamespaceElement(XmlNamespacesElement e) {
        if (e is XmlNamespacesDefaultElement def) {
            var uri = def.String?.Value ?? "";
            return $"DEFAULT '{uri}'";
        }
        if (e is XmlNamespacesAliasElement alias) {
            var uri = alias.String?.Value ?? "";
            var name = QuotedName(alias.Identifier) ?? "";
            return $"'{uri}' AS {name}";
        }
        return RawText(e);
    }

    private static string BuildOptimizerHint(OptimizerHint hint) {
        // USE HINT ('hint1', 'hint2', ...) — UseHintList.HintKind is Unspecified (0)
        if (hint is UseHintList uhl && uhl.Hints?.Count > 0)
            return $"USE HINT ({string.Join(", ", uhl.Hints.Select(h => $"'{h.Value}'"))})";
        // OPTIMIZE FOR — variable list or OPTIMIZE FOR UNKNOWN
        if (hint is OptimizeForOptimizerHint ofh) {
            if (ofh.IsForUnknown) return "OPTIMIZE FOR UNKNOWN";
            var pairs = ofh.Pairs?.Select(p => {
                var varName = p.Variable?.Name ?? "";
                if (p.IsForUnknown) return $"{varName} UNKNOWN";
                var val = p.Value != null ? RawText(p.Value) : "UNKNOWN";
                return $"{varName} = {val}";
            }) ?? [];
            return $"OPTIMIZE FOR ({string.Join(", ", pairs)})";
        }
        var kind = hint.HintKind switch {
            OptimizerHintKind.Recompile => "RECOMPILE",
            OptimizerHintKind.MaxDop => "MAXDOP",
            OptimizerHintKind.ForceOrder => "FORCE ORDER",
            OptimizerHintKind.ExpandViews => "EXPAND VIEWS",
            OptimizerHintKind.KeepPlan => "KEEP PLAN",
            OptimizerHintKind.KeepFixedPlan => "KEEPFIXED PLAN",
            OptimizerHintKind.LoopJoin => "LOOP JOIN",
            OptimizerHintKind.HashJoin => "HASH JOIN",
            OptimizerHintKind.MergeJoin => "MERGE JOIN",
            OptimizerHintKind.HashGroup => "HASH GROUP",
            OptimizerHintKind.OrderGroup => "ORDER GROUP",
            _ => hint.HintKind.ToString().ToUpper(),
        };
        if (hint is LiteralOptimizerHint lit && lit.Value != null)
            return $"{kind} {lit.Value.Value}";
        return kind;
    }

    private static SqlNode BuildCte(CommonTableExpression cte) =>
        new SqlNode(
            "CommonTableExpression",
            cte.StartOffset,
            cte.StartOffset + cte.FragmentLength,
            QuotedName(cte.ExpressionName),
            new Dictionary<string, object?> {
                ["name"] = QuotedName(cte.ExpressionName),
                ["columns"] = cte.Columns?.Select(c => (object?)QuotedName(c)).ToList(),
                ["query"] = BuildQueryExpression(cte.QueryExpression),
            });

    // -------------------------------------------------------------------------
    // DML: INSERT
    // -------------------------------------------------------------------------

    private static SqlNode BuildInsertStatement(InsertStatement ins) {
        var spec = ins.InsertSpecification;
        if (spec == null) return Leaf("InsertStatement", ins);

        var ctes = ins.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var columns = spec.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList();
        SqlNode? source = spec.InsertSource switch {
            ValuesInsertSource { IsDefaultValues: true } dvs => Node("DefaultValuesSource", dvs, new Dictionary<string, object?>()),
            ValuesInsertSource vals => BuildValuesInsertSource(vals),
            SelectInsertSource sel => BuildQueryExpression(sel.Select),
            _ => spec.InsertSource != null
                ? Leaf("InsertSource", spec.InsertSource, RawText(spec.InsertSource))
                : null,
        };

        return Node("InsertStatement", ins, new Dictionary<string, object?> {
            // OPTION (RECOMPILE, MAXDOP 1, ...)
            ["optimizerHints"] = MapList(ins.OptimizerHints, h => (object?)BuildOptimizerHint(h)),
            ["ctes"] = ctes,
            ["changeTrackingContext"] = RawTextOrNull(ins.WithCtesAndXmlNamespaces?.ChangeTrackingContext),
            ["target"] = target,
            ["columns"] = columns,
            ["source"] = source,
            ["output"] = BuildOutputClause(spec.OutputClause),
            ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
            ["top"] = spec.TopRowFilter != null ? BuildTopRowFilter(spec.TopRowFilter) : null,
        });
    }

    private static SqlNode BuildValuesInsertSource(ValuesInsertSource vals) {
        var rows = vals.RowValues?.Select(rv => {
            var values = rv.ColumnValues?.Select(cv => (object?)BuildScalarExpression(cv)).ToList();
            return (object?)Node("ValuesRow", rv, new Dictionary<string, object?> { ["values"] = values });
        }).ToList();

        return Node("ValuesSource", vals, new Dictionary<string, object?> { ["rows"] = rows });
    }

    // -------------------------------------------------------------------------
    // DML: UPDATE
    // -------------------------------------------------------------------------

    private static SqlNode BuildUpdateStatement(UpdateStatement upd) {
        var spec = upd.UpdateSpecification;
        if (spec == null) return Leaf("UpdateStatement", upd);

        var ctes = upd.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var setClauses = spec.SetClauses?.Select(sc => (object?)BuildSetClause(sc)).ToList();
        var fromClause = spec.FromClause != null ? BuildFromClause(spec.FromClause) : null;
        var whereClause = BuildDmlWhere(spec.WhereClause);

        return Node("UpdateStatement", upd, new Dictionary<string, object?> {
            // OPTION (RECOMPILE, MAXDOP 1, ...)
            ["optimizerHints"] = MapList(upd.OptimizerHints, h => (object?)BuildOptimizerHint(h)),
            ["ctes"] = ctes,
            ["changeTrackingContext"] = RawTextOrNull(upd.WithCtesAndXmlNamespaces?.ChangeTrackingContext),
            ["top"] = spec.TopRowFilter != null ? BuildTopRowFilter(spec.TopRowFilter) : null,
            ["target"] = target,
            ["set"] = setClauses,
            ["from"] = fromClause,
            ["where"] = whereClause,
            ["output"] = BuildOutputClause(spec.OutputClause),
            ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
        });
    }

    /// <summary>
    /// The WHERE of an UPDATE or DELETE: a search condition, or WHERE CURRENT OF cursor —
    /// the row a cursor is on. Dropping the latter would update or delete every row.
    /// </summary>
    private static SqlNode? BuildDmlWhere(WhereClause? where) {
        if (where == null) return null;
        if (where.Cursor != null) {
            return Node("CurrentOfCursor", where, new Dictionary<string, object?> {
                ["name"] = QuotedName(where.Cursor.Name),
                ["global"] = where.Cursor.IsGlobal ? (object?)true : null,
            });
        }
        return BuildBooleanExpression(where.SearchCondition);
    }

    private static SqlNode BuildSetClause(SetClause sc) => sc switch {
        AssignmentSetClause asc => Node("AssignmentSetClause", asc, new Dictionary<string, object?> {
            // Column is null when the LHS is a variable: SET @var = expr
            ["column"] = asc.Column != null ? BuildColumnRef(asc.Column) : null,
            // Variable is non-null for: SET @var = expr  or  SET col = @var = expr
            ["variable"] = asc.Variable?.Name,
            ["operator"] = asc.AssignmentKind.ToString(),
            ["value"] = BuildScalarExpression(asc.NewValue),
        }),
        _ => Leaf("SetClause", sc, RawText(sc)),
    };

    // -------------------------------------------------------------------------
    // DML: DELETE
    // -------------------------------------------------------------------------

    private static SqlNode BuildDeleteStatement(DeleteStatement del) {
        var spec = del.DeleteSpecification;
        if (spec == null) return Leaf("DeleteStatement", del);

        var ctes = del.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var fromClause = spec.FromClause != null ? BuildFromClause(spec.FromClause) : null;
        var whereClause = BuildDmlWhere(spec.WhereClause);

        return Node("DeleteStatement", del, new Dictionary<string, object?> {
            // OPTION (RECOMPILE, MAXDOP 1, ...)
            ["optimizerHints"] = MapList(del.OptimizerHints, h => (object?)BuildOptimizerHint(h)),
            ["ctes"] = ctes,
            ["changeTrackingContext"] = RawTextOrNull(del.WithCtesAndXmlNamespaces?.ChangeTrackingContext),
            ["top"] = spec.TopRowFilter != null ? BuildTopRowFilter(spec.TopRowFilter) : null,
            ["target"] = target,
            ["from"] = fromClause,
            ["where"] = whereClause,
            ["output"] = BuildOutputClause(spec.OutputClause),
            ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
        });
    }

    private static SqlNode BuildBeginTransaction(BeginTransactionStatement bt) {
        return Node("BeginTransactionStatement", bt, new Dictionary<string, object?> {
            // A transaction or savepoint name may be a variable: BEGIN TRAN @t
            ["name"] = QuotedName(bt.Name),
            ["distributed"] = bt.Distributed ? (object?)true : null,
            ["markDefined"] = bt.MarkDefined ? (object?)true : null,
            // WITH MARK 'description' | @variable, as written
            ["markDescription"] = bt.MarkDefined ? RawTextOrNull(bt.MarkDescription) : null,
        });
    }

    private static SqlNode BuildCommitTransaction(CommitTransactionStatement ct) =>
        Node("CommitTransactionStatement", ct, new Dictionary<string, object?> {
            ["name"] = QuotedName(ct.Name),
            // COMMIT ... WITH (DELAYED_DURABILITY = ON | OFF)
            ["delayedDurability"] = ct.DelayedDurabilityOption switch {
                OptionState.On => "ON",
                OptionState.Off => "OFF",
                _ => null,
            },
        });

    private static SqlNode BuildRollbackTransaction(RollbackTransactionStatement rt) =>
        // ROLLBACK TRAN @savepoint rolls back to the savepoint; losing the name would roll
        // back the whole transaction
        Node("RollbackTransactionStatement", rt, new Dictionary<string, object?> { ["name"] = QuotedName(rt.Name) });

    private static SqlNode BuildDeclareVariable(DeclareVariableStatement dv) {
        var decls = dv.Declarations?.Select(d => (object?)BuildDeclareElement(d)).ToList();
        return Node("DeclareVariableStatement", dv, new Dictionary<string, object?> { ["declarations"] = decls });
    }

    private static SqlNode BuildDeclareElement(DeclareVariableElement d) {
        bool isUdt = d.DataType is UserDataTypeReference;
        string? dataType;
        if (d.DataType is UserDataTypeReference udt) {
            var schema = QuotedName(udt.Name?.SchemaIdentifier);
            var baseName = QuotedName(udt.Name?.BaseIdentifier);
            dataType = schema != null ? $"{schema}.{baseName}" : baseName;
        } else if (d.DataType is SqlDataTypeReference { SqlDataTypeOption: SqlDataTypeOption.Cursor }) {
            dataType = "CURSOR";
        } else {
            dataType = d.DataType?.Name?.BaseIdentifier?.Value;
        }
        return new SqlNode("DeclareVariableElement", d.StartOffset, d.StartOffset + d.FragmentLength, d.VariableName?.Value,
            new Dictionary<string, object?> {
                ["name"] = d.VariableName?.Value,
                ["dataType"] = dataType,
                ["isUdt"] = isUdt ? (object?)true : null,
                ["dataTypeParams"] = DataTypeParams(d.DataType),
                ["value"] = BuildScalarExpression(d.Value),
            });
    }

    private static SqlNode BuildDeclareTableVariable(DeclareTableVariableStatement dtv) {
        var body = dtv.Body;
        var columns = body?.Definition?.ColumnDefinitions?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = body?.Definition?.TableConstraints?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        return Node("DeclareTableVariableStatement", dtv, new Dictionary<string, object?> {
            ["name"] = body?.VariableName?.Value,
            ["columns"] = columns,
            ["constraints"] = constraints,
            ["indexes"] = MapList(body?.Definition?.Indexes, i => (object?)BuildInlineIndex(i)),
        });
    }

    private static SqlNode BuildSetVariable(SetVariableStatement sv) {
        // XML method call syntax: SET @xmlDoc.modify('...')
        // sv.Identifier holds the method name; sv.Parameters holds the arguments.
        if (sv.Identifier != null) {
            var methodArgs = sv.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
            return Node("SetVariableStatement", sv, new Dictionary<string, object?> {
                ["name"] = sv.Variable?.Name,
                ["methodName"] = sv.Identifier.Value,
                ["methodArgs"] = methodArgs,
                // SET @a.m(...) calls a method; SET @a.p = 1 assigns a property (no parentheses)
                ["functionCall"] = sv.FunctionCallExists ? (object?)true : null,
                ["separator"] = sv.SeparatorType == SeparatorType.DoubleColon ? "::" : null,
                ["value"] = sv.Expression != null ? BuildScalarExpression(sv.Expression) : null,
                ["operator"] = sv.Expression != null ? sv.AssignmentKind.ToString() : null,
            });
        }

        // When SET @cur = CURSOR FOR SELECT..., Expression is null and CursorDefinition is set.
        SqlNode? cursorDef = null;
        if (sv.CursorDefinition != null) {
            var curOpts = sv.CursorDefinition.Options
                ?.Select(o => (object?)SerializeCursorOption(o.OptionKind)).ToList();
            var curSelect = sv.CursorDefinition.Select != null
                ? BuildQueryExpression(sv.CursorDefinition.Select.QueryExpression)
                : null;
            cursorDef = Node("CursorDefinition", sv.CursorDefinition, new Dictionary<string, object?> {
                ["options"] = curOpts,
                ["select"] = curSelect,
            });
        }
        return Node("SetVariableStatement", sv, new Dictionary<string, object?> {
            ["name"] = sv.Variable?.Name,
            ["value"] = cursorDef ?? BuildScalarExpression(sv.Expression),
            ["operator"] = sv.AssignmentKind.ToString(),
        });
    }

    private static SqlNode BuildSetRowCount(SetRowCountStatement src) =>
        Node("SetRowCountStatement", src, new Dictionary<string, object?> { ["rows"] = BuildScalarExpression(src.NumberRows) });

    private static SqlNode BuildPrint(PrintStatement ps) =>
        Node("PrintStatement", ps, new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(ps.Expression) });

    private static SqlNode BuildReturn(ReturnStatement rs) =>
        Node("ReturnStatement", rs, new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(rs.Expression) });

    private static SqlNode BuildIf(IfStatement ifs) =>
        Node("IfStatement", ifs, new Dictionary<string, object?> {
            ["condition"] = BuildBooleanExpression(ifs.Predicate),
            ["then"] = BuildStatement(ifs.ThenStatement),
            ["else"] = ifs.ElseStatement != null ? BuildStatement(ifs.ElseStatement) : null,
        });

    private static SqlNode BuildWhile(WhileStatement ws) =>
        Node("WhileStatement", ws, new Dictionary<string, object?> {
            ["condition"] = BuildBooleanExpression(ws.Predicate),
            ["body"] = BuildStatement(ws.Statement),
        });

    private static SqlNode BuildExecute(ExecuteStatement es) {
        var spec = es.ExecuteSpecification;
        var entity = spec?.ExecutableEntity;
        var execProc = entity as ExecutableProcedureReference;

        var parameters = entity?.Parameters?.Select(p => (object?)Node("ExecuteParameter", p, new Dictionary<string, object?> {
            ["name"] = p.Variable?.Name,
            ["value"] = BuildScalarExpression(p.ParameterValue),
            ["output"] = p.IsOutput,
        })).ToList();

        // WITH RECOMPILE, RESULT SETS (...) | NONE | UNDEFINED
        var options = es.Options?.Select(o => (object?)(o switch {
            ResultSetsExecuteOption rs => rs.ResultSetsOptionKind switch {
                ResultSetsOptionKind.None => "RESULT SETS NONE",
                ResultSetsOptionKind.Undefined => "RESULT SETS UNDEFINED",
                _ => null,
            } is { } word
                ? Leaf("ExecuteOption", rs, word)
                : Node("ResultSetsOption", rs, new Dictionary<string, object?> {
                    // A definition's own span is off by a token, so build each from its parts
                    ["definitions"] = rs.Definitions.Select(d => (object?)(d switch {
                        InlineResultSetDefinition inline =>
                            "(" + string.Join(", ", inline.ResultColumnDefinitions.Select(c => RawText(c).Trim())) + ")",
                        SchemaObjectResultSetDefinition so =>
                            $"AS {(so.ResultSetType == ResultSetType.Type ? "TYPE" : "OBJECT")} {RawText(so.Name).Trim()}",
                        _ => "AS FOR XML",
                    })).ToList(),
                }),
            _ => Leaf("ExecuteOption", o, o.OptionKind.ToString().ToUpperInvariant()),
        })).ToList();

        return Node("ExecuteStatement", es, new Dictionary<string, object?> {
            // EXECUTE (@sql) or EXECUTE (@sql1 + @sql2) — dynamic SQL
            ["sqlStrings"] = entity is ExecutableStringList esl ? esl.Strings.Select(x => (object?)BuildScalarExpression(x)).ToList() : null,
            // Named proc: EXECUTE schema.proc[;number] | variable proc: EXECUTE @var
            ["proc"] = BuildSchemaObjectName(execProc?.ProcedureReference?.ProcedureReference?.Name),
            ["procNumber"] = RawTextOrNull(execProc?.ProcedureReference?.ProcedureReference?.Number),
            ["procVar"] = execProc?.ProcedureReference?.ProcedureVariable?.Name,
            ["returnVar"] = spec?.Variable?.Name,
            ["parameters"] = parameters,
            // EXECUTE ('...') AS USER | LOGIN = 'name'
            ["contextKind"] = spec?.ExecuteContext != null ? spec.ExecuteContext.Kind.ToString().ToUpperInvariant() : null,
            ["contextPrincipal"] = RawTextOrNull(spec?.ExecuteContext?.Principal),
            ["linkedServer"] = QuotedName(spec?.LinkedServer),
            ["options"] = options,
        });
    }

    // Kept as separate kind/value fields (not one pre-joined string) so the printer can
    // keyword()-case the option name per sqlKeywordCase — a plain string, like the old
    // AtomicOptionToSql return, always prints as-is regardless of that option.
    private static SqlNode AtomicOptionToNode(AtomicBlockOption opt) {
        var kindStr = opt.OptionKind switch {
            AtomicBlockOptionKind.IsolationLevel => "TRANSACTION ISOLATION LEVEL",
            AtomicBlockOptionKind.Language => "LANGUAGE",
            AtomicBlockOptionKind.DateFirst => "DATEFIRST",
            AtomicBlockOptionKind.DateFormat => "DATEFORMAT",
            AtomicBlockOptionKind.DelayedDurability => "DELAYED_DURABILITY",
            _ => opt.OptionKind.ToString().ToUpperInvariant(),
        };
        var valueStr = opt switch {
            IdentifierAtomicBlockOption id => id.Value?.Value ?? RawText(opt).Trim(),
            LiteralAtomicBlockOption lit => RawText(lit.Value),
            OnOffAtomicBlockOption oo => oo.OptionState == OptionState.On ? "ON" : "OFF",
            _ => RawText(opt).Trim(),
        };
        return Node("AtomicOption", opt, new Dictionary<string, object?> {
            ["kind"] = kindStr,
            ["value"] = valueStr,
        });
    }

    private static SqlNode BuildBeginEndAtomic(BeginEndAtomicBlockStatement atomic) {
        var atomicOpts = atomic.Options?.Select(o => (object?)AtomicOptionToNode(o)).ToList();
        var stmts = atomic.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("BeginEndAtomicBlock", atomic, new Dictionary<string, object?> {
            ["atomicOptions"] = atomicOpts,
            ["statements"] = stmts,
        });
    }

    private static SqlNode BuildBeginEnd(BeginEndBlockStatement begin) {
        var stmts = begin.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("BeginEndBlock", begin, new Dictionary<string, object?> {
            ["statements"] = stmts,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE TABLE
    // -------------------------------------------------------------------------

    /// <summary>INFINITE, or a count and unit: `6 months`.</summary>
    private static string RetentionPeriodText(RetentionPeriodDefinition rp) {
        if (rp.IsInfinity) return "infinite";
        var duration = RawText(rp.Duration);
        var unit = rp.Units.ToString().ToLowerInvariant().TrimEnd('s');
        return duration == "1" ? $"{duration} {unit}" : $"{duration} {unit}s";
    }

    private static string RdaState(string state) => state switch {
        "Enable" => "on",
        "Disable" => "off",
        "OffWithoutDataRecovery" => "off_without_data_recovery",
        _ => state.ToLowerInvariant(),
    };

    /// <summary>A name or a value written where either can go: an identifier, or a literal as written.</summary>
    private static string IdentifierOrValueText(IdentifierOrValueExpression? v) =>
        v == null ? "" : v.Identifier != null ? QuotedName(v.Identifier) ?? "" : v.ValueExpression != null ? RawText(v.ValueExpression) : v.Value;

    private static string SerializeTableOption(TableOption opt) {
        if (opt is LedgerTableOption ledger) {
            // LEDGER = ON (LEDGER_VIEW = v (transaction_id_column_name = ..., ...), APPEND_ONLY = ON)
            var parts = new List<string>();
            if (ledger.LedgerViewOption is { ViewName: not null } lv) {
                var cols = new List<string>();
                if (lv.TransactionIdColumnName != null) cols.Add($"transaction_id_column_name = {QuotedName(lv.TransactionIdColumnName)}");
                if (lv.SequenceNumberColumnName != null) cols.Add($"sequence_number_column_name = {QuotedName(lv.SequenceNumberColumnName)}");
                if (lv.OperationTypeColumnName != null) cols.Add($"operation_type_column_name = {QuotedName(lv.OperationTypeColumnName)}");
                if (lv.OperationTypeDescColumnName != null) cols.Add($"operation_type_desc_column_name = {QuotedName(lv.OperationTypeDescColumnName)}");
                var view = $"ledger_view = {SchemaObjectText(lv.ViewName)}";
                parts.Add(cols.Count > 0 ? $"{view} ({string.Join(", ", cols)})" : view);
            }
            if (ledger.AppendOnly != OptionState.NotSet)
                parts.Add($"append_only = {ledger.AppendOnly.ToString().ToLower()}");
            var state = ledger.OptionState.ToString().ToLower();
            return parts.Count > 0 ? $"ledger = {state} ({string.Join(", ", parts)})" : $"ledger = {state}";
        }
        // REMOTE_DATA_ARCHIVE = ON | OFF | OFF_WITHOUT_DATA_RECOVERY [(FILTER_PREDICATE = ..., MIGRATION_STATE = ...)]
        if (opt is RemoteDataArchiveAlterTableOption rdaAlter) {
            var parts = new List<string>();
            if (rdaAlter.IsFilterPredicateSpecified)
                parts.Add("filter_predicate = " + (rdaAlter.FilterPredicate != null ? RawText(rdaAlter.FilterPredicate) : "null"));
            if (rdaAlter.IsMigrationStateSpecified)
                parts.Add("migration_state = " + rdaAlter.MigrationState.ToString().ToLowerInvariant());
            var state = RdaState(rdaAlter.RdaTableOption.ToString());
            return parts.Count > 0 ? $"remote_data_archive = {state} ({string.Join(", ", parts)})" : $"remote_data_archive = {state}";
        }
        if (opt is RemoteDataArchiveTableOption rda) {
            var migration = rda.MigrationState.ToString();
            var state = RdaState(rda.RdaTableOption.ToString());
            return migration == "NotSpecified" ? $"remote_data_archive = {state}"
                : $"remote_data_archive = {state} (migration_state = {migration.ToLowerInvariant()})";
        }
        if (opt is FileStreamOnTableOption fsOn)
            return $"filestream_on = {IdentifierOrValueText(fsOn.Value)}";
        if (opt is FileTableDirectoryTableOption ftDir)
            return $"filetable_directory = {RawText(ftDir.Value)}";
        if (opt is FileTableCollateFileNameTableOption ftCollate)
            return $"filetable_collate_filename = {(ftCollate.Value != null ? QuotedName(ftCollate.Value) : "database_default")}";
        if (opt is FileTableConstraintNameTableOption ftConstraint)
            return ftConstraint.OptionKind switch {
                TableOptionKind.FileTablePrimaryKeyConstraintName => $"filetable_primary_key_constraint_name = {QuotedName(ftConstraint.Value)}",
                TableOptionKind.FileTableStreamIdUniqueConstraintName => $"filetable_streamid_unique_constraint_name = {QuotedName(ftConstraint.Value)}",
                _ => $"filetable_fullpath_unique_constraint_name = {QuotedName(ftConstraint.Value)}",
            };
        if (opt is MemoryOptimizedTableOption mo)
            return $"memory_optimized = {mo.OptionState.ToString().ToLower()}";
        if (opt is DurabilityTableOption dur) {
            var val = dur.DurabilityTableOptionKind == DurabilityTableOptionKind.SchemaOnly ? "schema_only" : "schema_and_data";
            return $"durability = {val}";
        }
        if (opt is LockEscalationTableOption le)
            return $"lock_escalation = {le.Value.ToString().ToLower()}";
        if (opt is SystemVersioningTableOption svo) {
            var state = svo.OptionState == OptionState.On ? "on"
                      : svo.OptionState == OptionState.Off ? "off"
                      : "on";
            // Optional HISTORY_TABLE and DATA_CONSISTENCY_CHECK sub-options sit in
            // a nested paren: SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.Tbl)
            var subOpts = new System.Text.StringBuilder();
            if (svo.HistoryTable != null) {
                var histSchema = QuotedName(svo.HistoryTable.SchemaIdentifier);
                var histBase = QuotedName(svo.HistoryTable.BaseIdentifier);
                var histName = histSchema != null ? $"{histSchema}.{histBase}" : histBase;
                subOpts.Append($"history_table = {histName}");
            }
            if (svo.ConsistencyCheckEnabled == OptionState.On) {
                if (subOpts.Length > 0) subOpts.Append(", ");
                subOpts.Append("data_consistency_check = on");
            } else if (svo.ConsistencyCheckEnabled == OptionState.Off) {
                if (subOpts.Length > 0) subOpts.Append(", ");
                subOpts.Append("data_consistency_check = off");
            }
            if (svo.RetentionPeriod != null) {
                if (subOpts.Length > 0) subOpts.Append(", ");
                subOpts.Append($"history_retention_period = {RetentionPeriodText(svo.RetentionPeriod)}");
            }
            var subPart = subOpts.Length > 0 ? $" ({subOpts})" : "";
            return $"system_versioning = {state}{subPart}";
        }
        // HEAP | CLUSTERED COLUMNSTORE INDEX [ORDER (...)] | CLUSTERED INDEX (cols): the option
        // fragment doesn't reach its tokens, so build the text from the parsed value.
        if (opt is TableIndexOption { Value: TableNonClusteredIndexType }) return "heap";
        if (opt is TableIndexOption { Value: TableClusteredIndexType clustered }) {
            string Col(ColumnReferenceExpression c) => string.Join(".", c.MultiPartIdentifier.Identifiers.Select(i => QuotedName(i)));
            if (clustered.ColumnStore) {
                return clustered.OrderedColumns?.Count > 0
                    ? $"clustered columnstore index order ({string.Join(", ", clustered.OrderedColumns.Select(Col))})"
                    : "clustered columnstore index";
            }
            return $"clustered index ({string.Join(", ", clustered.Columns.Select(c => Col(c.Column) + (c.SortOrder == SortOrder.Descending ? " desc" : "")))})";
        }
        return OptionText(opt);
    }

    private static string SerializeIndexOption(IndexOption opt) {
        // CompressionDelayIndexOption: compression_delay = N [minutes|minute]
        if (opt is CompressionDelayIndexOption cdo) {
            var unit = cdo.TimeUnit switch {
                CompressionDelayTimeUnit.Minutes => " minutes",
                CompressionDelayTimeUnit.Minute => " minute",
                _ => "",
            };
            var val = cdo.Expression is IntegerLiteral il ? il.Value
                    : cdo.Expression != null ? RawText(cdo.Expression).Trim() : "0";
            return $"compression_delay = {val}{unit}";
        }
        // BUCKET_COUNT (hash indexes on memory-optimized tables): like LogOn trigger
        // actions, this option's own fragment doesn't carry offsets for its keyword,
        // only its value, so RawText(opt) returns just the number.
        if (opt is IndexExpressionOption { OptionKind: IndexOptionKind.BucketCount } beo) {
            var val = beo.Expression is IntegerLiteral il2 ? il2.Value
                    : beo.Expression != null ? RawText(beo.Expression).Trim() : "0";
            return $"bucket_count = {val}";
        }
        return RawText(opt).Trim();
    }

    private static string SerializeVectorIndexOption(IndexOption opt) {
        if (opt is VectorMetricIndexOption metric)
            return $"metric = '{metric.MetricType.ToString().ToLowerInvariant()}'";
        if (opt is VectorTypeIndexOption vtype)
            return $"type = '{vtype.VectorType}'";
        return RawText(opt).Trim();
    }

    private static string SerializeDropConstraintOption(DropClusteredConstraintOption o) {
        // ONLINE = ON / ONLINE = OFF
        if (o is DropClusteredConstraintStateOption state) {
            var kind = state.OptionKind.ToString().ToUpperInvariant();   // e.g. "Online" → "ONLINE"
            var val  = state.OptionState == OptionState.On ? "ON" : "OFF";
            return $"{kind} = {val}";
        }
        // MAXDOP = n
        if (o is DropClusteredConstraintValueOption valOpt) {
            var kind = valOpt.OptionKind.ToString().ToUpperInvariant();  // e.g. "MaxDop" → "MAXDOP"
            var val  = valOpt.OptionValue is IntegerLiteral il ? il.Value
                     : valOpt.OptionValue != null ? RawText(valOpt.OptionValue).Trim() : "0";
            return $"{kind} = {val}";
        }
        // WAIT_AT_LOW_PRIORITY (...) — RawText produces the full parenthesised sub-expression correctly
        return RawText(o).Trim();
    }

    private static SqlNode BuildInlineIndex(IndexDefinition idx) {
        var kindStr = idx.IndexType?.IndexTypeKind switch {
            IndexTypeKind.Clustered => "clustered",
            IndexTypeKind.NonClustered => "nonclustered",
            IndexTypeKind.ClusteredColumnStore => "clustered columnstore",
            IndexTypeKind.NonClusteredColumnStore => "nonclustered columnstore",
            IndexTypeKind.NonClusteredHash => "nonclustered hash",
            _ => null,
        };
        var cols = idx.Columns?.Select(c => (object?)new SqlNode(
            "IndexColumn",
            c.StartOffset,
            c.StartOffset + c.FragmentLength,
            QuotedName(c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()),
            new Dictionary<string, object?> {
                ["name"] = QuotedName(c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()),
                ["sortOrder"] = c.SortOrder.ToString(),
            })).ToList();
        return Node("InlineIndexDefinition", idx, new Dictionary<string, object?> {
            ["indexName"] = QuotedName(idx.Name),
            ["unique"] = idx.Unique ? (object?)true : null,
            ["kind"] = kindStr,
            ["columns"] = cols,
            ["includeColumns"] = idx.IncludeColumns?.Select(c =>
                (object?)(QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? "")).ToList(),
            ["filterPredicate"] = idx.FilterPredicate != null ? BuildBooleanExpression(idx.FilterPredicate) : null,
            ["indexOptions"] = MapList(idx.IndexOptions, o => (object?)SerializeIndexOption(o)),
            ["onFileGroup"] = StorageTarget(idx.OnFileGroupOrPartitionScheme),
            ["fileStreamOn"] = QuotedName(idx.FileStreamOn),
        });
    }

    private static SqlNode BuildCreateTableStatement(CreateTableStatement ct) {
        var columns = ct.Definition?.ColumnDefinitions
            ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = ct.Definition?.TableConstraints
            ?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        var indexes = ct.Definition?.Indexes
            ?.Select(i => (object?)BuildInlineIndex(i)).ToList();
        var options = MapList(ct.Options, o => (object?)SerializeTableOption(o));
        // CREATE TABLE t [(col, ...)] [WITH (...)] AS SELECT ... (CTAS)
        var ctasSelect = ct.SelectStatement != null ? BuildSelectStatement(ct.SelectStatement) : null;
        var ctasColumns = MapList(ct.CtasColumns, c => (object?)QuotedName(c));

        // PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo) — temporal table period definition
        var stp = ct.Definition?.SystemTimePeriod;
        var systemTimePeriod = stp != null ? (object?)new Dictionary<string, object?> {
            ["startColumn"] = QuotedName(stp.StartTimeColumn),
            ["endColumn"] = QuotedName(stp.EndTimeColumn),
        } : null;

        // ON filegroup/partition — physical storage location
        var onName = StorageTarget(ct.OnFileGroupOrPartitionScheme);
        var textimageOn = QuotedName(ct.TextImageOn);
        var fileStreamOn = QuotedName(ct.FileStreamOn);

        return Node("CreateTableStatement", ct, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(ct.SchemaObjectName),
            ["columns"] = columns,
            ["ctasColumns"] = ctasColumns,
            ["ctasSelect"] = ctasSelect,
            ["constraints"] = constraints,
            ["indexes"] = indexes,
            ["systemTimePeriod"] = systemTimePeriod,
            ["options"] = options,
            ["onFileGroup"] = onName,
            ["textimageOn"] = textimageOn,
            ["fileStreamOn"] = fileStreamOn,
            // Graph table types
            ["asFileTable"] = ct.AsFileTable ? (object?)true : null,
            // FEDERATED ON (distribution_name = column_name)
            ["federatedOn"] = ct.FederationScheme != null
                ? $"{QuotedName(ct.FederationScheme.DistributionName)} = {QuotedName(ct.FederationScheme.ColumnName)}" : null,
            ["asNode"] = ct.AsNode ? (object?)true : null,
            ["asEdge"] = ct.AsEdge ? (object?)true : null,
        });
    }

    private static SqlNode BuildColumnDefinition(ColumnDefinition col) {
        // Always Encrypted (ENCRYPTED WITH ...): structured handling below via col.Encryption.
        // Fallback for older ScriptDOM versions where the property may not surface the same
        // way — never silently drop the clause even if col.Encryption comes back null.
        if (col.Encryption == null) {
            var rawCol = RawText(col).Trim();
            if (rawCol.IndexOf("ENCRYPTED", StringComparison.OrdinalIgnoreCase) >= 0)
                return Leaf("ColumnDefinition", col, rawCol);
        }

        // A column can carry several CHECK, UNIQUE or REFERENCES constraints; the printer models only one of
        // each kind, so a column with more stays as written rather than losing the rest
        if (col.Constraints != null && col.Constraints.GroupBy(c => c.GetType()).Any(g => g.Count() > 1))
            return Leaf("ColumnDefinition", col, RawText(col).Trim());

        if (col.ComputedColumnExpression != null) {
            return new SqlNode(
                "ColumnDefinition",
                col.StartOffset,
                col.StartOffset + col.FragmentLength,
                QuotedName(col.ColumnIdentifier),
                new Dictionary<string, object?> {
                    ["name"] = QuotedName(col.ColumnIdentifier),
                    ["computedExpression"] = BuildScalarExpression(col.ComputedColumnExpression),
                    ["isPersisted"] = col.IsPersisted ? (object?)true : null,
                    // Computed PERSISTED columns can have NOT NULL — preserve nullability
                    ["nullable"] = col.Constraints?.OfType<NullableConstraintDefinition>()
                        .FirstOrDefault()?.Nullable,
                });
        }

        var dt = col.DataType;
        var dataTypeName = dt?.Name?.BaseIdentifier?.Value;
        // A user-defined or alias type keeps its schema and is an identifier, not a keyword
        var isUdtType = dt is UserDataTypeReference;
        if (dt is UserDataTypeReference userType && userType.Name != null) dataTypeName = SchemaObjectText(userType.Name);
        // XML typed column: xml(dbo.MySchema) or xml(CONTENT dbo.MySchema) / xml(DOCUMENT ...)
        string? xmlSchemaCollection = null;
        string? xmlTypeOption = null;
        if (dt is XmlDataTypeReference xmlDt) {
            dataTypeName = "xml";
            if (xmlDt.XmlSchemaCollection != null)
                xmlSchemaCollection = RawText(xmlDt.XmlSchemaCollection).Trim();
            xmlTypeOption = xmlDt.XmlDataTypeOption switch {
                XmlDataTypeOption.Content => "CONTENT",
                XmlDataTypeOption.Document => "DOCUMENT",
                _ => null,
            };
        }

        return new SqlNode(
            "ColumnDefinition",
            col.StartOffset,
            col.StartOffset + col.FragmentLength,
            QuotedName(col.ColumnIdentifier),
            new Dictionary<string, object?> {
                ["name"] = QuotedName(col.ColumnIdentifier),
                // Column-level INDEX ix [CLUSTERED | NONCLUSTERED]
                ["index"] = col.Index != null ? BuildInlineIndex(col.Index) : null,
                ["dataType"] = dataTypeName,
                ["isUdt"] = isUdtType ? (object?)true : null,
                ["xmlSchemaCollection"] = xmlSchemaCollection,
                ["xmlTypeOption"] = xmlTypeOption,
                ["dataTypeParams"] = DataTypeParams(dt),
                ["nullable"] = col.Constraints?.OfType<NullableConstraintDefinition>()
                    .FirstOrDefault()?.Nullable,
                ["identity"] = col.IdentityOptions != null,
                ["identitySeed"] = (col.IdentityOptions?.IdentitySeed as Literal)?.Value,
                ["identityIncrement"] = (col.IdentityOptions?.IdentityIncrement as Literal)?.Value,
                ["identityNotForReplication"] = col.IdentityOptions?.IsIdentityNotForReplication == true ? (object?)true : null,
                ["defaultValue"] = col.DefaultConstraint != null
                    ? BuildScalarExpression(col.DefaultConstraint.Expression)
                    : null,
                ["defaultConstraintName"] = QuotedName(col.DefaultConstraint?.ConstraintIdentifier),
                // DEFAULT ... WITH VALUES: fill the new column's existing rows with the default
                ["defaultWithValues"] = col.DefaultConstraint?.WithValues == true ? (object?)true : null,
                ["isRowGuidCol"] = col.IsRowGuidCol ? (object?)true : null,
                // COLLATE clause on the column
                ["collation"] = col.Collation?.Value,
                // SPARSE / FILESTREAM / COLUMN_SET
                ["isSparse"] = col.StorageOptions?.SparseOption == SparseColumnOption.Sparse ? (object?)true : null,
                ["isFileStream"] = col.StorageOptions?.IsFileStream == true ? (object?)true : null,
                ["isColumnSet"] = col.StorageOptions?.SparseOption == SparseColumnOption.ColumnSetForAllSparseColumns ? (object?)true : null,
                // Temporal table: GENERATED ALWAYS AS ROW START / ROW END
                ["generatedAlways"] = col.GeneratedAlways.HasValue ? (object?)col.GeneratedAlways.Value.ToString() : null,
                ["isHidden"] = col.IsHidden ? (object?)true : null,
                // Dynamic data masking
                ["isMasked"] = col.IsMasked ? (object?)true : null,
                ["maskingFunction"] = col.MaskingFunction?.Value,
                // Always Encrypted
                ["encryption"] = BuildColumnEncryptionDefinition(col.Encryption),
                ["checkConstraint"] = col.Constraints?.OfType<CheckConstraintDefinition>().FirstOrDefault() is { } chk
                    ? BuildBooleanExpression(chk.CheckCondition)
                    : null,
                // Inline PRIMARY KEY / UNIQUE on the column itself
                ["uniqueConstraint"] = col.Constraints?.OfType<UniqueConstraintDefinition>().FirstOrDefault() is { } uq
                    ? (object?)new Dictionary<string, object?> {
                        ["constraintName"] = QuotedName(uq.ConstraintIdentifier),
                        ["isPrimaryKey"] = uq.IsPrimaryKey,
                        ["clustered"] = uq.Clustered == true ? (object?)true : uq.Clustered == false ? (object?)false : null,
                        ["hash"] = uq.IndexType?.IndexTypeKind == IndexTypeKind.NonClusteredHash ? (object?)true : null,
                        ["indexOptions"] = MapList(uq.IndexOptions, o => (object?)SerializeIndexOption(o)),
                        ["onFileGroup"] = StorageTarget(uq.OnFileGroupOrPartitionScheme),
                        ["fileStreamOn"] = QuotedName(uq.FileStreamOn),
                    }
                    : null,
                // Inline column-level CHECK constraint name
                ["checkConstraintName"] = col.Constraints?.OfType<CheckConstraintDefinition>().FirstOrDefault()
                    ?.ConstraintIdentifier is { } checkName ? QuotedName(checkName) : null,
                // Inline REFERENCES (column-level foreign key)
                ["foreignKey"] = col.Constraints?.OfType<ForeignKeyConstraintDefinition>().FirstOrDefault() is { } fk
                    ? (object?)new Dictionary<string, object?> {
                        ["constraintName"] = QuotedName(fk.ConstraintIdentifier),
                        ["refTable"] = BuildSchemaObjectName(fk.ReferenceTableName),
                        ["refColumns"] = fk.ReferencedTableColumns?.Select(c => (object?)QuotedName(c)).ToList(),
                        ["deleteAction"] = fk.DeleteAction != DeleteUpdateAction.NotSpecified ? (object?)fk.DeleteAction.ToString() : null,
                        ["updateAction"] = fk.UpdateAction != DeleteUpdateAction.NotSpecified ? (object?)fk.UpdateAction.ToString() : null,
                    }
                    : null,
            });
    }

    private static SqlNode BuildTableConstraint(ConstraintDefinition c) {
        var name = QuotedName(c.ConstraintIdentifier);
        return c switch {
            UniqueConstraintDefinition unique => new SqlNode(
                "UniqueConstraint",
                unique.StartOffset,
                unique.StartOffset + unique.FragmentLength,
                name,
                new Dictionary<string, object?> {
                    ["constraintName"] = name,
                    ["isPrimaryKey"] = unique.IsPrimaryKey,
                    // bool? — true = CLUSTERED, false = NONCLUSTERED, null = not specified
                    ["clustered"] = unique.Clustered == true ? (object?)true : unique.Clustered == false ? (object?)false : null,
                    // PRIMARY KEY NONCLUSTERED HASH (memory-optimized tables)
                    ["hash"] = unique.IndexType?.IndexTypeKind == IndexTypeKind.NonClusteredHash ? (object?)true : null,
                    ["columns"] = unique.Columns?.Select(col => (object?)new Dictionary<string, object?> {
                        ["name"] = QuotedName(col.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()),
                        ["order"] = col.SortOrder == SortOrder.Descending ? "Descending" : "Ascending",
                    }).ToList(),
                    ["indexOptions"] = MapList(unique.IndexOptions, o => (object?)SerializeIndexOption(o)),
                    ["onFileGroup"] = StorageTarget(unique.OnFileGroupOrPartitionScheme),
                    ["fileStreamOn"] = QuotedName(unique.FileStreamOn),
                }),
            CheckConstraintDefinition check => new SqlNode(
                "CheckConstraint",
                check.StartOffset,
                check.StartOffset + check.FragmentLength,
                name,
                new Dictionary<string, object?> {
                    ["constraintName"] = name,
                    ["expression"] = BuildBooleanExpression(check.CheckCondition),
                    ["notForReplication"] = check.NotForReplication ? (object?)true : null,
                }),
            ForeignKeyConstraintDefinition fk => new SqlNode(
                "ForeignKeyConstraint",
                fk.StartOffset,
                fk.StartOffset + fk.FragmentLength,
                name,
                new Dictionary<string, object?> {
                    ["constraintName"] = name,
                    ["columns"] = fk.Columns?.Select(col => (object?)QuotedName(col)).ToList(),
                    ["refTable"] = BuildSchemaObjectName(fk.ReferenceTableName),
                    ["refColumns"] = fk.ReferencedTableColumns?.Select(col => (object?)QuotedName(col)).ToList(),
                    ["deleteAction"] = fk.DeleteAction == DeleteUpdateAction.NotSpecified ? null : fk.DeleteAction.ToString(),
                    ["updateAction"] = fk.UpdateAction == DeleteUpdateAction.NotSpecified ? null : fk.UpdateAction.ToString(),
                    ["notForReplication"] = fk.NotForReplication ? (object?)true : null,
                }),
            // CONSTRAINT df DEFAULT 0 FOR col [WITH VALUES] (ALTER TABLE ... ADD)
            DefaultConstraintDefinition def => Node("DefaultConstraint", def, new Dictionary<string, object?> {
                ["constraintName"] = name,
                ["expression"] = BuildScalarExpression(def.Expression),
                ["column"] = QuotedName(def.Column),
                ["withValues"] = def.WithValues ? (object?)true : null,
            }),
            _ => Leaf("TableConstraint", c, RawText(c)),
        };
    }

    // -------------------------------------------------------------------------
    // DDL: ALTER TABLE
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterTableStatement(AlterTableStatement at) {
        var alterType = at.GetType().Name;
        var props = new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(at.SchemaObjectName),
            ["alterType"] = alterType,
        };

        if (at is AlterTableAddTableElementStatement addElem) {
            props["columns"] = addElem.Definition?.ColumnDefinitions
                ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
            props["constraints"] = addElem.Definition?.TableConstraints
                ?.Select(c => (object?)BuildTableConstraint(c)).ToList();
            props["indexes"] = MapList(addElem.Definition?.Indexes, i => (object?)BuildInlineIndex(i));
            // ADD PERIOD FOR SYSTEM_TIME (start, end)
            props["systemTimePeriod"] = addElem.Definition?.SystemTimePeriod is { } period
                ? $"{QuotedName(period.StartTimeColumn)}, {QuotedName(period.EndTimeColumn)}"
                : null;
            props["withCheckEnforcement"] = addElem.ExistingRowsCheckEnforcement == ConstraintEnforcement.NotSpecified
                ? null : addElem.ExistingRowsCheckEnforcement.ToString();
        } else if (at is AlterTableDropTableElementStatement dropElem) {
            props["elements"] = dropElem.AlterTableDropTableElements
                ?.Select(e => (object?)new Dictionary<string, object?> {
                    ["name"] = QuotedName(e.Name),
                    ["elementType"] = e.TableElementType.ToString(),
                    ["ifExists"] = e.IsIfExists,
                    // WITH (ONLINE = ON, WAIT_AT_LOW_PRIORITY ...) on DROP CLUSTERED CONSTRAINT
                    ["dropOptions"] = e.DropClusteredConstraintOptions?.Count > 0
                        ? e.DropClusteredConstraintOptions.Select(o => (object?)SerializeDropConstraintOption(o)).ToList()
                        : null,
                }).ToList();
        } else if (at is AlterTableConstraintModificationStatement constraintMod) {
            props["constraintEnforcement"] = constraintMod.ConstraintEnforcement.ToString();
            props["constraintNames"] = MapList(constraintMod.ConstraintNames, n => (object?)QuotedName(n));
        } else if (at is AlterTableAlterColumnStatement alterCol) {
            props["column"] = QuotedName(alterCol.ColumnIdentifier);
            props["dataType"] = alterCol.DataType is UserDataTypeReference { Name: not null } alterUdt ? SchemaObjectText(alterUdt.Name) : RawTextOrNull(alterCol.DataType);
            props["isUdt"] = alterCol.DataType is UserDataTypeReference ? (object?)true : null;
            props["nullable"] = alterCol.AlterTableAlterColumnOption == AlterTableAlterColumnOption.Null ? (object?)true
                : alterCol.AlterTableAlterColumnOption == AlterTableAlterColumnOption.NotNull ? false
                : null;
            // NoOptionDefined (= 0), Null, and NotNull are all handled via `nullable` prop.
            // Only emit alterColumnOption for actual property-modifier variants (AddMaskingFunction, etc.).
            var colOpt = alterCol.AlterTableAlterColumnOption;
            props["alterColumnOption"] = (colOpt == AlterTableAlterColumnOption.Null
                || colOpt == AlterTableAlterColumnOption.NotNull
                || colOpt.ToString() == "NoOptionDefined") ? null : colOpt.ToString();
            // ADD/DROP MASKED WITH
            props["maskingFunction"] = alterCol.MaskingFunction?.Value;
            // COLLATE clause — stored as a separate property on the statement
            props["collation"] = alterCol.Collation?.Value;
            // ALTER COLUMN a int [ENCRYPTED WITH (...)] [SPARSE] [HIDDEN] [MASKED WITH (...)] [WITH (ONLINE = ON)]
            props["encryption"] = BuildColumnEncryptionDefinition(alterCol.Encryption);
            props["isSparse"] = alterCol.StorageOptions?.SparseOption == SparseColumnOption.Sparse ? (object?)true : null;
            props["isFileStream"] = alterCol.StorageOptions?.IsFileStream == true ? (object?)true : null;
            props["isColumnSet"] = alterCol.StorageOptions?.SparseOption == SparseColumnOption.ColumnSetForAllSparseColumns ? (object?)true : null;
            props["generatedAlways"] = alterCol.GeneratedAlways.HasValue ? (object?)alterCol.GeneratedAlways.Value.ToString() : null;
            props["isHidden"] = alterCol.IsHidden ? (object?)true : null;
            props["isMasked"] = alterCol.IsMasked ? (object?)true : null;
            props["columnOptions"] = MapList(alterCol.Options, o => (object?)SerializeIndexOption(o));
        } else if (at is AlterTableSetStatement setStmt) {
            // Use SerializeTableOption so complex options like SYSTEM_VERSIONING are
            // correctly serialized (OptionKind is unreliable — it defaults to 0).
            props["options"] = setStmt.Options?.Select(o => (object?)SerializeTableOption(o)).ToList();
        } else if (at is AlterTableRebuildStatement rebuild) {
            props["partitionAll"] = rebuild.Partition?.All == true ? (object?)true : null;
            // A literal or a variable: REBUILD PARTITION = @p
            props["partitionNumber"] = RawTextOrNull(rebuild.Partition?.Number);
            props["indexOptions"] = MapList(rebuild.IndexOptions, o => (object?)SerializeIndexOption(o));
        } else if (at is AlterTableSwitchStatement switchStmt) {
            // Partition numbers may be literals, variables or $PARTITION.pf(...) expressions
            props["sourcePartition"] = RawTextOrNull(switchStmt.SourcePartitionNumber);
            props["targetTable"] = BuildSchemaObjectName(switchStmt.TargetTable);
            props["targetPartition"] = RawTextOrNull(switchStmt.TargetPartitionNumber);
            // WITH (WAIT_AT_LOW_PRIORITY (...)) — serialize each option as raw text
            props["switchOptions"] = switchStmt.Options?.Count > 0
                ? switchStmt.Options.Select(o => (object?)RawText(o).Trim()).ToList()
                : null;
        } else if (at is AlterTableTriggerModificationStatement triggerMod) {
            props["enable"] = triggerMod.TriggerEnforcement == TriggerEnforcement.Enable ? (object?)true : false;
            props["triggerAll"] = triggerMod.All ? (object?)true : null;
            props["triggerNames"] = MapList(triggerMod.TriggerNames, n => (object?)QuotedName(n));
        } else if (at is AlterTableChangeTrackingModificationStatement ct) {
            // ENABLE | DISABLE CHANGE_TRACKING [WITH (TRACK_COLUMNS_UPDATED = ON | OFF)]
            props["changeTracking"] = ct.IsEnable ? "enable" : "disable";
            props["trackColumnsUpdated"] = ct.TrackColumnsUpdated switch {
                OptionState.On => "on",
                OptionState.Off => "off",
                _ => null,
            };
        } else {
            // Rarely used forms (FILETABLE_NAMESPACE, ALTER INDEX, SPLIT/MERGE RANGE, CLUSTER BY, ...)
            // stay as the source text
            return LeafStatement(at);
        }

        return Node("AlterTableStatement", at, props);
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateIndexStatement(CreateIndexStatement ci) {
        var cols = ci.Columns?.Select(c => (object?)new SqlNode(
            "IndexColumn",
            c.StartOffset,
            c.StartOffset + c.FragmentLength,
            QuotedName(c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()),
            new Dictionary<string, object?> {
                ["name"] = QuotedName(c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()),
                ["sortOrder"] = c.SortOrder.ToString(),
            })).ToList();

        return new SqlNode(
            "CreateIndexStatement",
            ci.StartOffset, ci.StartOffset + ci.FragmentLength,
            QuotedName(ci.Name),
            new Dictionary<string, object?> {
                ["indexName"] = QuotedName(ci.Name),
                ["unique"] = ci.Unique,
                ["clustered"] = ci.Clustered == true ? (object?)true : ci.Clustered == false ? (object?)false : null,
                ["table"] = BuildSchemaObjectName(ci.OnName),
                ["columns"] = cols,
                ["includeColumns"] = ci.IncludeColumns?.Select(c => (object?)QuotedName(c.MultiPartIdentifier?.Identifiers.LastOrDefault())).ToList(),
                ["filterPredicate"] = ci.FilterPredicate != null ? BuildBooleanExpression(ci.FilterPredicate) : null,
                ["indexOptions"] = MapList(ci.IndexOptions, o => (object?)SerializeIndexOption(o)),
                ["onFileGroup"] = StorageTarget(ci.OnFileGroupOrPartitionScheme),
                ["fileStreamOn"] = QuotedName(ci.FileStreamOn),
            });
    }

    private static SqlNode BuildCreateVectorIndexStatement(CreateVectorIndexStatement cvi) =>
        Node("CreateVectorIndexStatement", cvi, new Dictionary<string, object?> {
            ["indexName"] = QuotedName(cvi.Name),
            ["table"] = BuildSchemaObjectName(cvi.OnName),
            ["vectorColumn"] = QuotedName(cvi.VectorColumn),
            ["indexOptions"] = MapList(cvi.IndexOptions, o => (object?)SerializeVectorIndexOption(o)),
            ["onFileGroup"] = StorageTarget(cvi.OnFileGroupOrPartitionScheme),
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE PROCEDURE
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Session context: EXECUTE AS / REVERT
    // -------------------------------------------------------------------------

    private static SqlNode BuildExecuteAsStatement(ExecuteAsStatement ea) {
        var ctx = ea.ExecuteContext;
        return Node("ExecuteAsStatement", ea, new Dictionary<string, object?> {
            ["kind"] = ctx?.Kind.ToString(),
            ["principal"] = ctx?.Principal != null ? BuildScalarExpression(ctx.Principal) : null,
            ["withNoRevert"] = ea.WithNoRevert,
            ["cookie"] = ea.Cookie != null ? Leaf("VariableReference", ea.Cookie, ea.Cookie.Name) : null,
        });
    }

    private static SqlNode BuildRevertStatement(RevertStatement rv) =>
        Node("RevertStatement", rv, new Dictionary<string, object?> {
            ["cookie"] = rv.Cookie != null ? BuildScalarExpression(rv.Cookie) : null,
        });

    // -------------------------------------------------------------------------
    // Procedure / function WITH options
    // -------------------------------------------------------------------------

    private static List<object?>? BuildProcedureOptions(IList<ProcedureOption>? options) {
        if (options == null || options.Count == 0) return null;
        return options.Select(opt => (object?)BuildProcedureOption(opt)).ToList();
    }

    private static SqlNode BuildProcedureOption(ProcedureOption opt) {
        if (opt is ExecuteAsProcedureOption execAs) {
            var clause = execAs.ExecuteAs;
            return Node("ExecuteAsOption", opt, new Dictionary<string, object?> {
                ["kind"] = clause?.ExecuteAsOption.ToString(),
                ["principal"] = clause?.Literal?.Value,
            });
        }
        // Simple option: map enum to SQL keyword string
        string optText = opt.OptionKind switch {
            ProcedureOptionKind.Encryption => "ENCRYPTION",
            ProcedureOptionKind.Recompile => "RECOMPILE",
            ProcedureOptionKind.NativeCompilation => "NATIVE_COMPILATION",
            ProcedureOptionKind.SchemaBinding => "SCHEMABINDING",
            _ => opt.OptionKind.ToString().ToUpper(),
        };
        return Leaf("ProcedureOption", opt, optText);
    }

    private static List<object?>? BuildFunctionOptions(IList<FunctionOption>? options) {
        if (options == null || options.Count == 0) return null;
        return options.Select(opt => (object?)BuildFunctionOption(opt)).ToList();
    }

    private static SqlNode BuildFunctionOption(FunctionOption opt) {
        if (opt is ExecuteAsFunctionOption execAs) {
            var clause = execAs.ExecuteAs;
            return Node("ExecuteAsOption", opt, new Dictionary<string, object?> {
                ["kind"] = clause?.ExecuteAsOption.ToString(),
                ["principal"] = clause?.Literal?.Value,
            });
        }
        string optText = opt.OptionKind switch {
            FunctionOptionKind.Encryption => "ENCRYPTION",
            FunctionOptionKind.SchemaBinding => "SCHEMABINDING",
            FunctionOptionKind.ReturnsNullOnNullInput => "RETURNS NULL ON NULL INPUT",
            FunctionOptionKind.CalledOnNullInput => "CALLED ON NULL INPUT",
            FunctionOptionKind.NativeCompilation => "NATIVE_COMPILATION",
            // INLINE = ON | OFF: scalar UDF inlining; OFF must stay OFF
            FunctionOptionKind.Inline => opt is InlineFunctionOption { OptionState: OptionState.Off } ? "INLINE = OFF" : "INLINE = ON",
            _ => opt.OptionKind.ToString().ToUpper(),
        };
        return Leaf("FunctionOption", opt, optText);
    }

    private static SqlNode BuildCreateProcedureStatement(CreateProcedureStatement cp) =>
        BuildProcedureStatement("CreateProcedureStatement", cp);

    private static SqlNode BuildProcedureParameter(ProcedureParameter p) {
        // Distinguish user-defined types from built-in types so the printer can
        // skip keyword-casing on UDT names (they are identifiers, not keywords).
        string? dataType;
        bool isUdt = p.DataType is UserDataTypeReference;
        if (p.DataType is UserDataTypeReference udt) {
            var schema = QuotedName(udt.Name?.SchemaIdentifier);
            var name = QuotedName(udt.Name?.BaseIdentifier);
            dataType = schema != null ? $"{schema}.{name}" : name;
        } else {
            dataType = RawTextOrNull(p.DataType);
        }
        return new SqlNode(
            "ProcedureParameter",
            p.StartOffset,
            p.StartOffset + p.FragmentLength,
            p.VariableName?.Value,
            new Dictionary<string, object?> {
                ["name"] = p.VariableName?.Value,
                ["dataType"] = dataType,
                ["isUdt"] = isUdt ? (object?)true : null,
                ["defaultValue"] = p.Value != null ? BuildScalarExpression(p.Value) : null,
                ["output"] = p.Modifier == ParameterModifier.Output,
                ["readonly"] = p.Modifier == ParameterModifier.ReadOnly,
                // @p int [NULL | NOT NULL]
                ["nullable"] = p.Nullable?.Nullable,
            });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateFunctionStatement(CreateFunctionStatement cf) =>
        BuildFunctionStatement("CreateFunctionStatement", cf);

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER / CREATE OR ALTER VIEW
    // -------------------------------------------------------------------------

    private static SqlNode BuildViewStatement(string type, ViewStatementBody view) {
        var rawOptions = view switch {
            CreateViewStatement cv => cv.ViewOptions,
            AlterViewStatement av => av.ViewOptions,
            CreateOrAlterViewStatement coa => coa.ViewOptions,
            _ => null,
        };
        var withOptions = rawOptions?.Select(o => (object?)(o.OptionKind switch {
            ViewOptionKind.SchemaBinding => "SCHEMABINDING",
            ViewOptionKind.Encryption => "ENCRYPTION",
            ViewOptionKind.ViewMetadata => "VIEW_METADATA",
            _ => o.OptionKind.ToString(),
        })).ToList();

        var body = view.SelectStatement;
        var queryExpr = body != null ? BuildQueryExpression(body.QueryExpression) : null;

        return Node(type, view, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(view.SchemaObjectName),
            ["columns"] = view.Columns?.Select(c => (object?)QuotedName(c)).ToList(),
            // AS WITH c AS (...) SELECT ...: the body's CTEs (and XMLNAMESPACES)
            ["ctes"] = body?.WithCtesAndXmlNamespaces?.CommonTableExpressions?.Select(c => (object?)BuildCte(c)).ToList(),
            ["xmlNamespaces"] = body?.WithCtesAndXmlNamespaces?.XmlNamespaces?.XmlNamespacesElements is { Count: > 0 } ns
                ? ns.Select(e => (object?)BuildXmlNamespaceElement(e)).ToList()
                : null,
            ["withOptions"] = withOptions,
            ["withCheckOption"] = view.WithCheckOption ? (object?)true : null,
            ["body"] = queryExpr,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE OR ALTER PROCEDURE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateOrAlterProcedure(CreateOrAlterProcedureStatement cap) =>
        BuildProcedureStatement("CreateOrAlterProcedureStatement", cap);

    // -------------------------------------------------------------------------
    // DDL: TRUNCATE TABLE
    // -------------------------------------------------------------------------

    private static SqlNode BuildTruncateTable(TruncateTableStatement trunc) {
        var partitionRanges = trunc.PartitionRanges?.Count > 0
            ? trunc.PartitionRanges.Select(pr => (object?)Node("PartitionRange", pr, new Dictionary<string, object?> {
                ["from"] = BuildScalarExpression(pr.From),
                ["to"] = pr.To != null ? (object?)BuildScalarExpression(pr.To) : null,
            })).ToList()
            : null;
        return Node("TruncateTableStatement", trunc, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(trunc.TableName),
            ["partitionRanges"] = partitionRanges,
        });
    }

    // -------------------------------------------------------------------------
    // Control flow: GOTO / LABEL / THROW / RAISERROR / TRY-CATCH
    // -------------------------------------------------------------------------

    private static SqlNode BuildGoto(GoToStatement gt) =>
        Node("GotoStatement", gt, new Dictionary<string, object?> {
            ["label"] = QuotedName(gt.LabelName),
        });

    private static SqlNode BuildLabel(LabelStatement lbl) =>
        Node("LabelStatement", lbl, new Dictionary<string, object?> {
            ["label"] = lbl.Value,
        });

    private static SqlNode BuildThrow(ThrowStatement thr) =>
        Node("ThrowStatement", thr, new Dictionary<string, object?> {
            ["errorNumber"] = BuildScalarExpression(thr.ErrorNumber),
            ["message"] = BuildScalarExpression(thr.Message),
            ["state"] = BuildScalarExpression(thr.State),
        });

    private static SqlNode BuildRaiseError(RaiseErrorStatement raise) {
        var flags = new List<string>();
        if (raise.RaiseErrorOptions.HasFlag(RaiseErrorOptions.Log))      flags.Add("LOG");
        if (raise.RaiseErrorOptions.HasFlag(RaiseErrorOptions.SetError)) flags.Add("SETERROR");
        if (raise.RaiseErrorOptions.HasFlag(RaiseErrorOptions.NoWait))   flags.Add("NOWAIT");
        return Node("RaiseErrorStatement", raise, new Dictionary<string, object?> {
            ["message"] = BuildScalarExpression(raise.FirstParameter),
            ["severity"] = BuildScalarExpression(raise.SecondParameter),
            ["state"] = BuildScalarExpression(raise.ThirdParameter),
            ["params"] = raise.OptionalParameters?.Count > 0
                ? (object?)raise.OptionalParameters.Select(p => (object?)BuildScalarExpression(p)).ToList()
                : null,
            ["withOptions"] = flags.Count > 0 ? (object?)flags : null,
        });
    }

    private static SqlNode BuildTryCatch(TryCatchStatement tc) =>
        Node("TryCatchStatement", tc, new Dictionary<string, object?> {
            ["tryBody"] = tc.TryStatements?.Statements?.Select(s => (object?)BuildStatement(s)).ToList(),
            ["catchBody"] = tc.CatchStatements?.Statements?.Select(s => (object?)BuildStatement(s)).ToList(),
        });

    // -------------------------------------------------------------------------
    // DDL: DROP TABLE / PROCEDURE / VIEW / FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildDropObjects(string type, DropObjectsStatement drop) =>
        Node(type, drop, new Dictionary<string, object?> {
            ["names"] = drop.Objects?.Select(o => (object?)BuildSchemaObjectName(o)).ToList(),
            ["ifExists"] = drop.IsIfExists,
            // DROP TRIGGER t ON DATABASE | ON ALL SERVER
            ["triggerScope"] = drop is DropTriggerStatement { TriggerScope: not TriggerScope.Normal } dts
                ? dts.TriggerScope.ToString() : null,
        });

    // -------------------------------------------------------------------------
    // DDL: DROP INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildDropIndex(DropIndexStatement di) =>
        Node("DropIndexStatement", di, new Dictionary<string, object?> {
            ["ifExists"] = di.IsIfExists ? (object?)true : null,
            ["indices"] = di.DropIndexClauses?.Select(c => (object?)(c switch {
                DropIndexClause dic => Node("IndexRef", dic, new Dictionary<string, object?> {
                    ["name"] = QuotedName(dic.Index),
                    ["table"] = BuildSchemaObjectName(dic.Object),
                    // WITH (ONLINE = ON, MAXDOP = 2, MOVE TO fg, FILESTREAM_ON fs)
                    ["options"] = MapList(dic.Options, o => (object?)(o switch {
                        MoveToDropIndexOption move => $"MOVE TO {StorageTarget(move.MoveTo)}",
                        FileStreamOnDropIndexOption fs => $"FILESTREAM_ON {QuotedName(fs.FileStreamOn)}",
                        _ => SerializeIndexOption(o),
                    })),
                }),
                // The old form: DROP INDEX table.index
                BackwardsCompatibleDropIndexClause old => Node("IndexRef", old, new Dictionary<string, object?> {
                    ["qualifiedName"] = string.Join(".", new[] { old.Index.SchemaIdentifier, old.Index.BaseIdentifier, old.Index.ChildIdentifier }
                        .Where(i => i != null).Select(i => QuotedName(i))),
                }),
                _ => Leaf("IndexRef", c, RawText(c)),
            })).ToList(),
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE / DROP SYNONYM
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateSynonym(CreateSynonymStatement stmt) =>
        Node("CreateSynonymStatement", stmt, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(stmt.Name),
            ["forName"] = BuildSchemaObjectName(stmt.ForName),
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER / DROP SCHEMA
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateSchema(CreateSchemaStatement stmt) =>
        Node("CreateSchemaStatement", stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.Name),
            ["owner"] = QuotedName(stmt.Owner),
            // CREATE SCHEMA s CREATE TABLE ... GRANT ...: statements created within the schema
            ["elements"] = stmt.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList(),
        });

    private static SqlNode BuildAlterSchema(AlterSchemaStatement stmt) =>
        Node("AlterSchemaStatement", stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.Name),
            // ObjectKind is the securable type being transferred (Object, Type, XmlSchemaCollection, etc.)
            ["objectKind"] = stmt.ObjectKind.ToString(),
            ["objectName"] = BuildSchemaObjectName(stmt.ObjectName),
        });

    private static SqlNode BuildDropSchema(DropSchemaStatement stmt) =>
        Node("DropSchemaStatement", stmt, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(stmt.Schema),
            ["ifExists"] = stmt.IsIfExists,
        });

    // -------------------------------------------------------------------------
    // Always Encrypted — CREATE/DROP COLUMN MASTER KEY, CREATE/ALTER/DROP COLUMN ENCRYPTION KEY
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateColumnMasterKey(CreateColumnMasterKeyStatement stmt) {
        string? keyStoreProviderName = null;
        string? keyPath = null;
        string? enclaveSignature = null;
        foreach (var p in stmt.Parameters ?? Enumerable.Empty<ColumnMasterKeyParameter>()) {
            switch (p) {
                case ColumnMasterKeyStoreProviderNameParameter n: keyStoreProviderName = RawTextOrNull(n.Name); break;
                case ColumnMasterKeyPathParameter path: keyPath = RawTextOrNull(path.Path); break;
                case ColumnMasterKeyEnclaveComputationsParameter enclave: enclaveSignature = RawTextOrNull(enclave.Signature); break;
            }
        }
        return Node("CreateColumnMasterKeyStatement", stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.Name),
            ["keyStoreProviderName"] = keyStoreProviderName,
            ["keyPath"] = keyPath,
            ["enclaveComputationsSignature"] = enclaveSignature,
        });
    }

    private static SqlNode BuildColumnEncryptionKeyStatement(
        string type, ColumnEncryptionKeyStatement stmt, ColumnEncryptionKeyAlterType? alterType
    ) =>
        Node(type, stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.Name),
            ["alterType"] = alterType?.ToString().ToUpperInvariant(),
            ["values"] = MapList(stmt.ColumnEncryptionKeyValues, BuildColumnEncryptionKeyValue),
        });

    private static SqlNode BuildColumnEncryptionKeyValue(ColumnEncryptionKeyValue v) {
        string? columnMasterKey = null;
        string? algorithm = null;
        string? encryptedValue = null;
        foreach (var p in v.Parameters ?? Enumerable.Empty<ColumnEncryptionKeyValueParameter>()) {
            switch (p) {
                case ColumnMasterKeyNameParameter n: columnMasterKey = QuotedName(n.Name); break;
                case ColumnEncryptionAlgorithmNameParameter a: algorithm = RawTextOrNull(a.Algorithm); break;
                case EncryptedValueParameter ev: encryptedValue = RawTextOrNull(ev.Value); break;
            }
        }
        return Node("ColumnEncryptionKeyValue", v, new Dictionary<string, object?> {
            ["columnMasterKey"] = columnMasterKey,
            ["algorithm"] = algorithm,
            ["encryptedValue"] = encryptedValue,
        });
    }

    private static SqlNode BuildDropUnownedObject(string type, DropUnownedObjectStatement stmt) =>
        Node(type, stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.Name),
            ["ifExists"] = stmt.IsIfExists ? (object?)true : null,
        });

    // CREATE/ALTER EXTERNAL MODEL name [AUTHORIZATION owner] WITH|SET (LOCATION = '...',
    // API_FORMAT = '...', MODEL_TYPE = EMBEDDINGS, MODEL = '...', CREDENTIAL = ...,
    // PARAMETERS = '...', LOCAL_RUNTIME_PATH = '...'). CREATE uses WITH, ALTER uses SET —
    // both keywords wrap the identical option list, and the option list is what we build here.
    private static SqlNode BuildExternalModel(string type, ExternalModelStatement s, string? owner) =>
        Node(type, s, new Dictionary<string, object?> {
            ["name"]             = QuotedName(s.Name),
            ["owner"]            = owner,
            ["location"]         = RawTextOrNull(s.Location),
            ["apiFormat"]        = RawTextOrNull(s.ApiFormat),
            ["modelType"]        = s.ModelType?.ToString().ToUpperInvariant(),
            ["modelName"]        = RawTextOrNull(s.ModelName),
            ["credential"]       = s.Credential != null ? QuotedName(s.Credential) : null,
            ["parameters"]       = RawTextOrNull(s.Parameters),
            ["localRuntimePath"] = RawTextOrNull(s.LocalRuntimePath),
        });

    // Column-level ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ..., ENCRYPTION_TYPE = ..., ALGORITHM = '...').
    // Returns a flat dictionary (not a Node-wrapped SqlNode) to match the sibling
    // uniqueConstraint/foreignKey props on ColumnDefinition, which the TS printer
    // destructures directly off node.props without unwrapping a nested SqlNode.
    private static Dictionary<string, object?>? BuildColumnEncryptionDefinition(ColumnEncryptionDefinition? def) {
        if (def == null) return null;
        string? columnEncryptionKey = null;
        string? encryptionType = null;
        string? algorithm = null;
        foreach (var p in def.Parameters ?? Enumerable.Empty<ColumnEncryptionDefinitionParameter>()) {
            switch (p) {
                case ColumnEncryptionKeyNameParameter n: columnEncryptionKey = QuotedName(n.Name); break;
                case ColumnEncryptionTypeParameter t: encryptionType = t.EncryptionType.ToString().ToUpperInvariant(); break;
                case ColumnEncryptionAlgorithmParameter a: algorithm = RawTextOrNull(a.EncryptionAlgorithm); break;
            }
        }
        return new Dictionary<string, object?> {
            ["columnEncryptionKey"] = columnEncryptionKey,
            ["encryptionType"] = encryptionType,
            ["algorithm"] = algorithm,
        };
    }

    // -------------------------------------------------------------------------
    // DML: MERGE
    // -------------------------------------------------------------------------

    private static SqlNode BuildMergeStatement(MergeStatement merge) {
        var spec = merge.MergeSpecification;
        var ctes = merge.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        return Node("MergeStatement", merge, new Dictionary<string, object?> {
            // OPTION (RECOMPILE, MAXDOP 1, ...)
            ["optimizerHints"] = MapList(merge.OptimizerHints, h => (object?)BuildOptimizerHint(h)),
            ["ctes"] = ctes,
            ["top"] = spec?.TopRowFilter != null ? BuildTopRowFilter(spec.TopRowFilter) : null,
            ["target"] = BuildTableReference(spec?.Target),
            ["targetAlias"] = QuotedName(spec?.TableAlias),
            ["source"] = BuildTableReference(spec?.TableReference),
            ["on"] = BuildBooleanExpression(spec?.SearchCondition),
            ["clauses"] = spec?.ActionClauses?.Select(c => (object?)BuildMergeActionClause(c)).ToList(),
            ["output"] = BuildOutputClause(spec?.OutputClause),
            ["outputInto"] = BuildOutputIntoClause(spec?.OutputIntoClause),
        });
    }

    private static SqlNode BuildMergeActionClause(MergeActionClause clause) =>
        Node("MergeActionClause", clause, new Dictionary<string, object?> {
            ["condition"] = clause.Condition.ToString(),
            ["predicate"] = BuildBooleanExpression(clause.SearchCondition),
            ["action"] = BuildMergeAction(clause.Action),
        });

    private static SqlNode BuildMergeAction(MergeAction action) =>
        action switch {
            InsertMergeAction ins => Node("MergeInsertAction", ins, new Dictionary<string, object?> {
                ["columns"] = ins.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
                ["source"] = ins.Source is ValuesInsertSource { IsDefaultValues: true } dvs
                              ? Node("DefaultValuesSource", dvs, new Dictionary<string, object?>())
                              : ins.Source is ValuesInsertSource vals
                              ? BuildValuesInsertSource(vals)
                              : ins.Source != null ? Leaf("InsertSource", ins.Source, RawText(ins.Source)) : null,
            }),
            UpdateMergeAction upd => Node("MergeUpdateAction", upd, new Dictionary<string, object?> {
                ["set"] = upd.SetClauses?.Select(s => (object?)BuildSetClause(s)).ToList(),
            }),
            DeleteMergeAction del => Node("MergeDeleteAction", del, new Dictionary<string, object?>()),
            _ => Leaf("MergeAction", action, RawText(action)),
        };

    // -------------------------------------------------------------------------
    // Full-text predicates: CONTAINS / FREETEXT
    // -------------------------------------------------------------------------

    private static SqlNode BuildFullTextPredicate(FullTextPredicate ftp) =>
        Node("FullTextPredicate", ftp, new Dictionary<string, object?> {
            ["functionType"] = ftp.FullTextFunctionType.ToString(),
            ["columns"] = ftp.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
            ["value"] = BuildScalarExpression(ftp.Value),
            ["language"] = RawTextOrNull(ftp.LanguageTerm),
        });

    private static SqlNode BuildFullTextTableReference(FullTextTableReference ftt) =>
        Node("FullTextTableReference", ftt, new Dictionary<string, object?> {
            ["functionType"] = ftt.FullTextFunctionType.ToString(),
            ["tableName"] = BuildSchemaObjectName(ftt.TableName),
            ["columns"] = ftt.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
            ["searchCondition"] = BuildScalarExpression(ftt.SearchCondition),
            ["topN"] = BuildScalarExpression(ftt.TopN),
            ["language"] = RawTextOrNull(ftt.Language),
            ["alias"] = QuotedName(ftt.Alias),
        });

    // -------------------------------------------------------------------------
    // USE / SET ON-OFF / WAITFOR / ALTER PROCEDURE / ALTER FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildUseStatement(UseStatement use) =>
        Node("UseStatement", use, new Dictionary<string, object?> {
            ["database"] = QuotedName(use.DatabaseName),
        });

    private static SqlNode BuildPredicateSetStatement(PredicateSetStatement ps) =>
        Node("PredicateSetStatement", ps, new Dictionary<string, object?> {
            ["options"] = SetOptionsToSql(ps.Options),
            ["isOn"] = ps.IsOn,
        });

    private static SqlNode BuildSetStatisticsStatement(SetStatisticsStatement sst) =>
        Node("SetStatisticsStatement", sst, new Dictionary<string, object?> {
            ["options"] = sst.Options.ToString().ToUpper(),
            ["isOn"] = sst.IsOn,
        });

    private static SqlNode BuildSetIdentityInsert(SetIdentityInsertStatement sis) =>
        Node("SetIdentityInsertStatement", sis, new Dictionary<string, object?> {
            ["table"] = BuildSchemaObjectName(sis.Table),
            ["isOn"] = sis.IsOn,
        });

    private static SqlNode BuildSetIsolationLevel(SetTransactionIsolationLevelStatement s) =>
        Node("SetTransactionIsolationLevelStatement", s, new Dictionary<string, object?> {
            ["level"] = s.Level.ToString(),
        });

    private static SqlNode BuildWaitFor(WaitForStatement wf) =>
        Node("WaitForStatement", wf, new Dictionary<string, object?> {
            ["option"] = wf.WaitForOption.ToString(),
            ["parameter"] = RawTextOrNull(wf.Parameter),
            // WAITFOR (RECEIVE ... | GET CONVERSATION GROUP ...), TIMEOUT n — the Service
            // Broker statement as written, since neither is formatted on its own yet
            ["statement"] = wf.Statement != null ? RawText(wf.Statement).Trim() : null,
            ["timeout"] = RawTextOrNull(wf.Timeout),
        });

    // SetOptions is a flags enum: SET NOCOUNT, XACT_ABORT ON arrives as one combined
    // value, whose ToString() ("NoCount, XactAbort") matched none of the names below.
    private static string SetOptionsToSql(SetOptions opt) =>
        string.Join(", ", Enum.GetValues<SetOptions>()
            .Where(f => f != 0 && opt.HasFlag(f))
            .Select(SetOptionToSql));

    private static string SetOptionToSql(SetOptions opt) => opt switch {
        SetOptions.NoCount => "NOCOUNT",
        SetOptions.QuotedIdentifier => "QUOTED_IDENTIFIER",
        SetOptions.AnsiNulls => "ANSI_NULLS",
        SetOptions.AnsiWarnings => "ANSI_WARNINGS",
        SetOptions.AnsiPadding => "ANSI_PADDING",
        SetOptions.AnsiDefaults => "ANSI_DEFAULTS",
        SetOptions.AnsiNullDfltOn => "ANSI_NULL_DFLT_ON",
        SetOptions.AnsiNullDfltOff => "ANSI_NULL_DFLT_OFF",
        SetOptions.XactAbort => "XACT_ABORT",
        SetOptions.ConcatNullYieldsNull => "CONCAT_NULL_YIELDS_NULL",
        SetOptions.ArithAbort => "ARITHABORT",
        SetOptions.ArithIgnore => "ARITHIGNORE",
        SetOptions.ImplicitTransactions => "IMPLICIT_TRANSACTIONS",
        SetOptions.RemoteProcTransactions => "REMOTE_PROC_TRANSACTIONS",
        SetOptions.CursorCloseOnCommit => "CURSOR_CLOSE_ON_COMMIT",
        SetOptions.FmtOnly => "FMTONLY",
        SetOptions.NoExec => "NOEXEC",
        SetOptions.NumericRoundAbort => "NUMERIC_ROUNDABORT",
        SetOptions.ParseOnly => "PARSEONLY",
        SetOptions.ForcePlan => "FORCEPLAN",
        SetOptions.ShowPlanAll => "SHOWPLAN_ALL",
        SetOptions.ShowPlanText => "SHOWPLAN_TEXT",
        SetOptions.ShowPlanXml => "SHOWPLAN_XML",
        SetOptions.NoBrowsetable => "NO_BROWSETABLE",
        SetOptions.DisableDefCnstChk => "DISABLE_DEF_CNST_CHK",
        _ => opt.ToString().ToUpper(),
    };

    private static SqlNode BuildProcedureStatement(string type, ProcedureStatementBody p) {
        var parms = p.Parameters?.Select(pr => (object?)BuildProcedureParameter(pr)).ToList();
        var stmts = p.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        // CLR stored procedure: AS EXTERNAL NAME assembly.[class].method
        string? externalName = null;
        if (p.MethodSpecifier != null) {
            var ms = p.MethodSpecifier;
            externalName = QuotedName(ms.AssemblyName) + "." + QuotedName(ms.ClassName) + "." + QuotedName(ms.MethodName);
        }
        return Node(type, p, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(p.ProcedureReference?.Name),
            // CREATE PROCEDURE name;number — the procedure's number within a group
            ["number"] = p.ProcedureReference?.Number?.Value,
            ["parameters"] = parms,
            ["options"] = BuildProcedureOptions(p.Options),
            // FOR REPLICATION: a procedure only replication runs
            ["forReplication"] = p.IsForReplication ? (object?)true : null,
            ["bodyStart"] = p.StatementList?.StartOffset,
            ["body"] = stmts,
            ["externalName"] = externalName,
        });
    }

    private static SqlNode BuildFunctionStatement(string type, FunctionStatementBody f) {
        var parms = f.Parameters?.Select(p => (object?)BuildProcedureParameter(p)).ToList();

        // CLR function: EXTERNAL NAME assembly.[class].method (no body)
        if (f.MethodSpecifier != null) {
            var ms = f.MethodSpecifier;
            var externalName = QuotedName(ms.AssemblyName) + "." + QuotedName(ms.ClassName) + "." + QuotedName(ms.MethodName);
            return Node(type, f, new Dictionary<string, object?> {
                ["name"] = BuildSchemaObjectName(f.Name),
                ["parameters"] = parms,
                ["options"] = BuildFunctionOptions(f.Options),
                // RETURNS TABLE (cols): a CLR table-valued function lists its columns
                ["returnType"] = f.ReturnType is TableValuedFunctionReturnType ? null : RawTextOrNull(f.ReturnType),
                ["returnColumns"] = (f.ReturnType as TableValuedFunctionReturnType)?.DeclareTableVariableBody?.Definition?.ColumnDefinitions
                    ?.Select(c => (object?)BuildColumnDefinition(c)).ToList(),
                ["externalName"] = externalName,
            });
        }

        string bodyType;
        object? body;

        if (f.ReturnType is SelectFunctionReturnType selRet) {
            bodyType = "table";
            QueryExpression? qexpr = selRet.SelectStatement?.QueryExpression;
            while (qexpr is QueryParenthesisExpression qpe) qexpr = qpe.QueryExpression;
            body = BuildQueryExpression(qexpr);
        } else if (f.ReturnType is TableValuedFunctionReturnType tvf) {
            bodyType = "inline-table";
            body = f.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
            return Node(type, f, new Dictionary<string, object?> {
                ["name"] = BuildSchemaObjectName(f.Name),
                ["parameters"] = parms,
                ["options"] = BuildFunctionOptions(f.Options),
                ["bodyStart"] = f.StatementList?.StartOffset,
                ["bodyType"] = bodyType,
                ["body"] = body,
                ["returnVar"] = tvf.DeclareTableVariableBody?.VariableName?.Value,
                ["returnColumns"] = tvf.DeclareTableVariableBody?.Definition?.ColumnDefinitions
                    ?.Select(c => (object?)BuildColumnDefinition(c)).ToList(),
                ["returnConstraints"] = MapList(tvf.DeclareTableVariableBody?.Definition?.TableConstraints, c => (object?)BuildTableConstraint(c)),
                ["returnIndexes"] = MapList(tvf.DeclareTableVariableBody?.Definition?.Indexes, i => (object?)BuildInlineIndex(i)),
            });
        } else {
            bodyType = "scalar";
            body = f.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        }

        return Node(type, f, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(f.Name),
            ["parameters"] = parms,
            ["options"] = BuildFunctionOptions(f.Options),
            ["bodyStart"] = f.StatementList?.StartOffset,
            ["returnType"] = RawTextOrNull(f.ReturnType),
            ["bodyType"] = bodyType,
            ["body"] = body,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER TRIGGER
    // -------------------------------------------------------------------------

    private static string TriggerActionToSql(TriggerAction action) =>
        action.TriggerActionType switch {
            TriggerActionType.Insert => "INSERT",
            TriggerActionType.Update => "UPDATE",
            TriggerActionType.Delete => "DELETE",
            // LOGON (server-level logon trigger event): the action fragment carries no
            // source offsets of its own, so RawText(action) returns "" for it.
            TriggerActionType.LogOn => "LOGON",
            // DDL trigger events: TriggerActionType.ToString() returns "Event" for all DDL types;
            // use RawText to get the actual keyword (e.g. CREATE_TABLE, DDL_TABLE_EVENTS).
            _ => RawText(action).ToUpperInvariant().Trim(),
        };

    private static SqlNode BuildTriggerStatement(string type, TriggerStatementBody trigger) {
        var scope = trigger.TriggerObject?.TriggerScope.ToString() ?? "Normal";
        var targetName = scope == "Normal" ? BuildSchemaObjectName(trigger.TriggerObject?.Name) : null;
        var actions = trigger.TriggerActions?.Select(a => (object?)TriggerActionToSql(a)).ToList();
        var stmts = trigger.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node(type, trigger, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(trigger.Name),
            ["triggerScope"] = scope != "Normal" ? scope : null,
            ["onName"] = targetName,
            ["triggerType"] = trigger.TriggerType.ToString(),
            ["actions"] = actions,
            ["notForReplication"] = trigger.IsNotForReplication ? (object?)true : null,
            // CLR trigger: AS EXTERNAL NAME assembly.[class].method
            ["externalName"] = trigger.MethodSpecifier is { } tms
                ? QuotedName(tms.AssemblyName) + "." + QuotedName(tms.ClassName) + "." + QuotedName(tms.MethodName)
                : null,
            // WITH EXECUTE AS ..., ENCRYPTION, NATIVE_COMPILATION, SCHEMABINDING
            ["options"] = MapList(trigger.Options, o => (object?)(o is ExecuteAsTriggerOption execAs
                ? Node("ExecuteAsOption", o, new Dictionary<string, object?> {
                    ["kind"] = execAs.ExecuteAsClause?.ExecuteAsOption.ToString(),
                    ["principal"] = execAs.ExecuteAsClause?.Literal?.Value,
                })
                : Leaf("TriggerOption", o, o.OptionKind switch {
                    TriggerOptionKind.Encryption => "ENCRYPTION",
                    TriggerOptionKind.NativeCompile => "NATIVE_COMPILATION",
                    TriggerOptionKind.SchemaBinding => "SCHEMABINDING",
                    _ => o.OptionKind.ToString().ToUpperInvariant(),
                }))),
            ["body"] = stmts,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: ALTER INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterIndex(AlterIndexStatement ai) =>
        Node("AlterIndexStatement", ai, new Dictionary<string, object?> {
            ["indexName"] = QuotedName(ai.Name),   // null means ALL
            ["table"] = BuildSchemaObjectName(ai.OnName),
            ["alterType"] = ai.AlterIndexType.ToString(),
            ["indexOptions"] = MapList(ai.IndexOptions, o => (object?)SerializeIndexOption(o)),
            ["partition"] = ai.Partition != null ? RawText(ai.Partition) : null,
        });

    // -------------------------------------------------------------------------
    // Cursor operations
    // -------------------------------------------------------------------------

    private static string SerializeCursorOption(CursorOptionKind kind) => kind switch {
        CursorOptionKind.ForwardOnly => "FORWARD_ONLY",
        CursorOptionKind.FastForward => "FAST_FORWARD",
        CursorOptionKind.ScrollLocks => "SCROLL_LOCKS",
        CursorOptionKind.ReadOnly => "READ_ONLY",
        CursorOptionKind.TypeWarning => "TYPE_WARNING",
        _ => kind.ToString().ToUpper(),
    };

    private static SqlNode BuildDeclareCursor(DeclareCursorStatement dc) {
        var opts = dc.CursorDefinition?.Options
            ?.Select(o => (object?)SerializeCursorOption(o.OptionKind)).ToList();
        var select = dc.CursorDefinition?.Select != null
            ? BuildQueryExpression(dc.CursorDefinition.Select.QueryExpression)
            : null;
        return Node("DeclareCursorStatement", dc, new Dictionary<string, object?> {
            ["name"] = QuotedName(dc.Name),
            ["options"] = opts,
            ["select"] = select,
        });
    }

    private static SqlNode BuildOpenCursor(OpenCursorStatement oc) =>
        Node("OpenCursorStatement", oc, new Dictionary<string, object?> {
            ["cursorName"] = QuotedName(oc.Cursor?.Name),
            ["cursorGlobal"] = oc.Cursor?.IsGlobal == true ? (object?)true : null,
        });

    private static SqlNode BuildFetchCursor(FetchCursorStatement fc) {
        var intoVars = fc.IntoVariables?.Select(v => (object?)v.Name).ToList();
        return Node("FetchCursorStatement", fc, new Dictionary<string, object?> {
            ["fetchType"] = fc.FetchType?.Orientation.ToString(),
            ["cursorName"] = QuotedName(fc.Cursor?.Name),
            ["cursorGlobal"] = fc.Cursor?.IsGlobal == true ? (object?)true : null,
            ["intoVariables"] = intoVars,
            ["fetchOffset"] = BuildScalarExpression(fc.FetchType?.RowOffset),
        });
    }

    private static SqlNode BuildCloseCursor(CloseCursorStatement cc) =>
        Node("CloseCursorStatement", cc, new Dictionary<string, object?> {
            ["cursorName"] = QuotedName(cc.Cursor?.Name),
            ["cursorGlobal"] = cc.Cursor?.IsGlobal == true ? (object?)true : null,
        });

    private static SqlNode BuildDeallocateCursor(DeallocateCursorStatement dalc) =>
        Node("DeallocateCursorStatement", dalc, new Dictionary<string, object?> {
            ["cursorName"] = QuotedName(dalc.Cursor?.Name),
            ["cursorGlobal"] = dalc.Cursor?.IsGlobal == true ? (object?)true : null,
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER / DROP SEQUENCE
    // -------------------------------------------------------------------------

    private static Dictionary<string, object?> ExtractSequenceOptions(IList<SequenceOption>? options) {
        string? dataType = null;
        string? startWith = null;
        string? restartWith = null;
        string? incrementBy = null;
        string? minValue = null;
        string? maxValue = null;
        bool? cycle = null;
        bool noMinValue = false;
        bool noMaxValue = false;
        bool noCache = false;
        bool restart = false;
        bool cacheDefault = false;
        string? cache = null;

        foreach (var opt in options ?? []) {
            if (opt is DataTypeSequenceOption dtOpt) {
                dataType = RawTextOrNull(dtOpt.DataType);
            } else if (opt is ScalarExpressionSequenceOption seOpt && seOpt.OptionValue != null) {
                var val = RawText(seOpt.OptionValue);
                switch (seOpt.OptionKind) {
                    case SequenceOptionKind.Start: startWith = val; break;
                    case SequenceOptionKind.Restart: restartWith = val; break;
                    case SequenceOptionKind.Increment: incrementBy = val; break;
                    case SequenceOptionKind.MinValue: minValue = val; break;
                    case SequenceOptionKind.MaxValue: maxValue = val; break;
                    case SequenceOptionKind.Cache: cache = val; break;
                }
            } else {
                // NoValue=true means it's a NO xxx option (NO CYCLE, NO MINVALUE, etc.)
                switch (opt.OptionKind) {
                    case SequenceOptionKind.Cycle:
                        cycle = !opt.NoValue; // false=NO CYCLE, true=CYCLE
                        break;
                    case SequenceOptionKind.MinValue:
                        if (opt.NoValue) noMinValue = true;
                        break;
                    case SequenceOptionKind.MaxValue:
                        if (opt.NoValue) noMaxValue = true;
                        break;
                    case SequenceOptionKind.Cache:
                        if (opt.NoValue) noCache = true;
                        else cacheDefault = true; // CACHE without a size
                        break;
                    // RESTART without WITH: back to the start value
                    case SequenceOptionKind.Restart:
                        restart = true;
                        break;
                }
            }
        }

        return new Dictionary<string, object?> {
            ["dataType"] = dataType,
            ["startWith"] = startWith,
            ["restartWith"] = restartWith,
            ["incrementBy"] = incrementBy,
            ["minValue"] = minValue,
            ["maxValue"] = maxValue,
            ["noMinValue"] = noMinValue,
            ["noMaxValue"] = noMaxValue,
            ["cycle"] = cycle,
            ["cache"] = cache,
            ["noCache"] = noCache,
            ["restart"] = restart ? (object?)true : null,
            ["cacheDefault"] = cacheDefault ? (object?)true : null,
        };
    }

    private static SqlNode BuildCreateSequence(CreateSequenceStatement cseq) {
        var opts = ExtractSequenceOptions(cseq.SequenceOptions);
        opts["name"] = BuildSchemaObjectName(cseq.Name);
        return Node("CreateSequenceStatement", cseq, opts);
    }

    private static SqlNode BuildAlterSequence(AlterSequenceStatement aseq) {
        var opts = ExtractSequenceOptions(aseq.SequenceOptions);
        opts["name"] = BuildSchemaObjectName(aseq.Name);
        return Node("AlterSequenceStatement", aseq, opts);
    }

    // -------------------------------------------------------------------------
    // DDL: PARTITION FUNCTIONS & SCHEMES
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreatePartitionFunction(CreatePartitionFunctionStatement cpf) {
        var range = cpf.Range == PartitionFunctionRange.Left ? "Left"
                  : cpf.Range == PartitionFunctionRange.Right ? "Right"
                  : (string?)null;
        return Node("CreatePartitionFunctionStatement", cpf, new Dictionary<string, object?> {
            ["name"] = QuotedName(cpf.Name),
            ["paramType"] = cpf.ParameterType?.DataType != null ? RawText(cpf.ParameterType.DataType) : null,
            ["collation"] = cpf.ParameterType?.Collation?.Value,
            ["range"] = range,
            ["boundaryValues"] = cpf.BoundaryValues?.Select(v => (object?)BuildScalarExpression(v)).ToList(),
        });
    }

    private static SqlNode BuildAlterPartitionFunction(AlterPartitionFunctionStatement apf) =>
        Node("AlterPartitionFunctionStatement", apf, new Dictionary<string, object?> {
            ["name"] = QuotedName(apf.Name),
            ["isSplit"] = apf.IsSplit,
            ["boundary"] = apf.Boundary != null ? BuildScalarExpression(apf.Boundary) : null,
        });

    private static SqlNode BuildDropPartitionFunction(DropPartitionFunctionStatement dpf) =>
        Node("DropPartitionFunctionStatement", dpf, new Dictionary<string, object?> {
            ["name"] = QuotedName(dpf.Name),
            ["ifExists"] = dpf.IsIfExists,
        });

    private static SqlNode BuildCreatePartitionScheme(CreatePartitionSchemeStatement cps) =>
        Node("CreatePartitionSchemeStatement", cps, new Dictionary<string, object?> {
            ["name"] = QuotedName(cps.Name),
            ["partitionFunction"] = QuotedName(cps.PartitionFunction),
            ["isAll"] = cps.IsAll,
            ["fileGroups"] = cps.FileGroups?.Select(fg => (object?)RawText(fg)).ToList(),
        });

    private static SqlNode BuildAlterPartitionScheme(AlterPartitionSchemeStatement aps) =>
        Node("AlterPartitionSchemeStatement", aps, new Dictionary<string, object?> {
            ["name"] = QuotedName(aps.Name),
            ["fileGroup"] = RawTextOrNull(aps.FileGroup),
        });

    private static SqlNode BuildDropPartitionScheme(DropPartitionSchemeStatement dps) =>
        Node("DropPartitionSchemeStatement", dps, new Dictionary<string, object?> {
            ["name"] = QuotedName(dps.Name),
            ["ifExists"] = dps.IsIfExists,
        });

    // -------------------------------------------------------------------------
    // DML: BULK INSERT
    // -------------------------------------------------------------------------

    private static SqlNode BuildBulkInsert(BulkInsertStatement bulk) =>
        Node("BulkInsertStatement", bulk, new Dictionary<string, object?> {
            ["table"] = BuildSchemaObjectName(bulk.To),
            ["from"] = RawTextOrNull(bulk.From),
            ["options"] = MapList(bulk.Options, o => (object?)RawText(o)),
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE TYPE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateTypeUddt(CreateTypeUddtStatement ctud) =>
        Node("CreateTypeUddtStatement", ctud, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(ctud.Name),
            ["dataType"] = DataTypeText(ctud.DataType),
            ["isUdt"] = UdtFlag(ctud.DataType),
            ["nullable"] = ctud.NullableConstraint?.Nullable,
        });

    private static SqlNode BuildCreateTypeTable(CreateTypeTableStatement cttbl) {
        var columns = cttbl.Definition?.ColumnDefinitions
            ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = cttbl.Definition?.TableConstraints
            ?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        return Node("CreateTypeTableStatement", cttbl, new Dictionary<string, object?> {
            ["name"] = BuildSchemaObjectName(cttbl.Name),
            ["columns"] = columns,
            ["constraints"] = constraints,
            ["indexes"] = MapList(cttbl.Definition?.Indexes, i => (object?)BuildInlineIndex(i)),
            // WITH (MEMORY_OPTIMIZED = ON)
            ["options"] = MapList(cttbl.Options, o => (object?)SerializeTableOption(o)),
        });
    }

    private static SqlNode BuildSchemaItem(SchemaDeclarationItem item) {
        var text = RawText(item);
        // SchemaDeclarationItemOpenjson.AsJson is outside the fragment span — append manually
        if (item is SchemaDeclarationItemOpenjson ojItem && ojItem.AsJson)
            text += " as json";
        return Leaf("SchemaItem", item, text);
    }

    private static SqlNode BuildOpenXmlTableReference(OpenXmlTableReference ox) =>
        Node("OpenXmlTableReference", ox, new Dictionary<string, object?> {
            ["variable"] = RawTextOrNull(ox.Variable),
            ["rowPattern"] = RawTextOrNull(ox.RowPattern),
            ["flags"] = RawTextOrNull(ox.Flags),
            ["withItems"] = MapList(ox.SchemaDeclarationItems, i => (object?)BuildSchemaItem(i)),
            ["tableName"] = ox.TableName != null ? BuildSchemaObjectName(ox.TableName) : null,
            ["alias"] = QuotedName(ox.Alias),
        });

    private static SqlNode BuildOpenJsonTableReference(OpenJsonTableReference oj) =>
        Node("OpenJsonTableReference", oj, new Dictionary<string, object?> {
            ["variable"] = RawTextOrNull(oj.Variable),
            ["rowPattern"] = RawTextOrNull(oj.RowPattern),
            ["withItems"] = MapList(oj.SchemaDeclarationItems, i => (object?)BuildSchemaItem(i)),
            ["alias"] = QuotedName(oj.Alias),
        });

    // -------------------------------------------------------------------------
    // Rowset functions: OPENROWSET (provider form) and OPENROWSET(BULK ...)
    // -------------------------------------------------------------------------

    private static SqlNode BuildOpenRowsetTableReference(OpenRowsetTableReference or) =>
        Node("OpenRowsetTableReference", or, new Dictionary<string, object?> {
            ["providerName"] = RawTextOrNull(or.ProviderName),
            // Connection: either a single provider string or three-part datasource;userid;password
            ["providerString"] = RawTextOrNull(or.ProviderString),
            ["dataSource"] = RawTextOrNull(or.DataSource),
            ["userId"] = RawTextOrNull(or.UserId),
            ["password"] = RawTextOrNull(or.Password),
            // Third argument: either an ad-hoc query string or a remote schema object name
            ["query"] = RawTextOrNull(or.Query),
            ["object"] = or.Object != null ? BuildSchemaObjectName(or.Object) : null,
            ["alias"] = QuotedName(or.Alias),
        });

    private static SqlNode BuildBulkOpenRowset(BulkOpenRowset bulk) =>
        Node("BulkOpenRowset", bulk, new Dictionary<string, object?> {
            ["dataFiles"] = MapList(bulk.DataFiles, f => (object?)RawText(f)),
            ["options"] = MapList(bulk.Options, o => (object?)RawText(o)),
            ["alias"] = QuotedName(bulk.Alias),
        });

    // -------------------------------------------------------------------------
    // Database administration: DROP DATABASE, DBCC, BACKUP, RESTORE,
    // CREATE DATABASE, ALTER DATABASE (all variants)
    // -------------------------------------------------------------------------

    private static SqlNode BuildDropDatabase(DropDatabaseStatement stmt) =>
        Node("DropDatabaseStatement", stmt, new Dictionary<string, object?> {
            ["databases"] = stmt.Databases?.Select(d => (object?)QuotedName(d)).ToList(),
            ["ifExists"] = stmt.IsIfExists,
        });

    private static SqlNode BuildDbcc(DbccStatement stmt) =>
        Node("DbccStatement", stmt, new Dictionary<string, object?> {
            // DbccCommand enum names don't always match the SQL keyword
            // (e.g. CHECKCONSTRAINTS → Command = Free, not CheckConstraints).
            // Extract the real command name from the token stream instead.
            ["command"] = DbccCommandName(stmt),
            ["literals"] = MapList(stmt.Literals, l => (object?)RawText(l)),
            ["options"] = MapList(stmt.Options, o => (object?)RawText(o)),
            ["optionsUseJoin"] = stmt.OptionsUseJoin,
        });

    /// <summary>
    /// Returns the actual DBCC command keyword (e.g. "CHECKCONSTRAINTS") by reading
    /// the second non-whitespace token in the statement's token range, which is always
    /// the command name regardless of how the DbccCommand enum maps it.
    /// </summary>
    private static string DbccCommandName(DbccStatement stmt) {
        var stream = stmt.ScriptTokenStream;
        if (stream == null || stream.Count == 0) return stmt.Command.ToString().ToUpperInvariant();
        var start = stmt.StartOffset;
        var end = start + stmt.FragmentLength;
        int count = 0;
        foreach (var t in stream) {
            if (t.Offset < start || t.Offset >= end) continue;
            if (t.TokenType == TSqlTokenType.WhiteSpace) continue;
            count++;
            if (count == 2) return t.Text.ToUpperInvariant(); // skip DBCC (1st), return command name (2nd)
        }
        return stmt.Command.ToString().ToUpperInvariant();
    }

    // DeviceInfo raw text only captures the physical path — reconstruct "DISK = 'path'" manually.
    private static string BuildDeviceInfoText(DeviceInfo d) {
        if (d.LogicalDevice != null) return RawText(d.LogicalDevice);
        var typeSql = d.DeviceType switch {
            DeviceType.Tape => "TAPE",
            DeviceType.Url => "URL",
            DeviceType.VirtualDevice => "VIRTUAL_DEVICE",
            _ => "DISK",
        };
        return $"{typeSql} = {(d.PhysicalDevice != null ? RawText(d.PhysicalDevice) : "")}";
    }

    // BackupOption: flag options (no value) have the correct SQL keyword in their raw text
    // (e.g. NOFORMAT, NOINIT, NOREWIND — not NO_FORMAT). Value-bearing options only carry
    // the value in raw text (e.g. "10" for STATS = 10), so we prepend the keyword name.
    private static string BackupOptionText(BackupOption o) {
        if (o.Value == null) return RawText(o).Trim();
        var name = System.Text.RegularExpressions.Regex
                         .Replace(o.OptionKind.ToString(), "(?<=[a-z])(?=[A-Z])", "_")
                         .ToUpperInvariant();
        var rawVal = RawText(o.Value).Trim();
        if (rawVal.Length == 0) return name;
        if (rawVal.StartsWith(name, StringComparison.OrdinalIgnoreCase)) return rawVal;
        return $"{name} = {rawVal}";
    }

    private static SqlNode BuildBackupStatement(string type, BackupStatement stmt) {
        // FILE / FILEGROUP lists, MIRROR TO and ENCRYPTION (...) are not modelled: keep the statement as written
        if ((stmt is BackupDatabaseStatement { Files.Count: > 0 }) || stmt.MirrorToClauses.Count > 0
            || stmt.Options.Any(o => o is BackupEncryptionOption))
            return LeafStatement(stmt);
        return Node(type, stmt, new Dictionary<string, object?> {
            ["database"] = RawTextOrNull(stmt.DatabaseName),
            ["devices"] = MapList(stmt.Devices, d => (object?)BuildDeviceInfoText(d)),
            ["options"] = MapList(stmt.Options, o => (object?)BackupOptionText(o)),
        });
    }

    private static SqlNode BuildBackupDatabase(BackupDatabaseStatement stmt) =>
        BuildBackupStatement("BackupDatabaseStatement", stmt);

    private static SqlNode BuildBackupLog(BackupTransactionLogStatement stmt) =>
        BuildBackupStatement("BackupTransactionLogStatement", stmt);

    // DatabaseOption raw text omits the option keyword (e.g. "RECOVERY FULL" → raw is "FULL").
    // Map the OptionKind enum name (PascalCase) to its SQL name (SCREAMING_SNAKE_CASE).
    private static string DatabaseOptionKindToSql(DatabaseOptionKind kind) {
        return System.Text.RegularExpressions.Regex
            .Replace(kind.ToString(), "(?<=[a-z])(?=[A-Z])", "_")
            .ToUpperInvariant();
    }

    private static string RestoreKindToSql(RestoreStatementKind kind) => kind switch {
        RestoreStatementKind.TransactionLog => "LOG",
        RestoreStatementKind.FileListOnly => "FILELISTONLY",
        RestoreStatementKind.VerifyOnly => "VERIFYONLY",
        RestoreStatementKind.LabelOnly => "LABELONLY",
        RestoreStatementKind.RewindOnly => "REWINDONLY",
        RestoreStatementKind.HeaderOnly => "HEADERONLY",
        _ => "DATABASE",
    };

    // Restore options: flag options carry their keyword in RawText; value-bearing options
    // only carry the value. MoveRestoreOption's raw text starts after the MOVE keyword.
    private static string RestoreOptionText(RestoreOption o) {
        if (o is MoveRestoreOption move)
            return $"MOVE {RawText(move.LogicalFileName)} TO {RawText(move.OSFileName)}";
        if (o is ScalarExpressionRestoreOption sro && sro.Value != null)
            return $"{sro.OptionKind.ToString().ToUpperInvariant()} = {RawText(sro.Value).Trim()}";
        return RawText(o).Trim();
    }

    private static SqlNode BuildRestore(RestoreStatement stmt) {
        // FILE / FILEGROUP / PAGE lists, FROM DATABASE_SNAPSHOT, STOPAT / STOPATMARK and FILESTREAM options
        // are not modelled: keep the statement as written
        if (stmt.Files.Count > 0 || stmt.Devices.Any(d => d.DeviceType.ToString() == "DatabaseSnapshot")
            || stmt.Options.Any(o => o is StopRestoreOption or FileStreamRestoreOption))
            return LeafStatement(stmt);
        return Node("RestoreStatement", stmt, new Dictionary<string, object?> {
            ["kind"] = RestoreKindToSql(stmt.Kind),
            ["database"] = RawTextOrNull(stmt.DatabaseName),
            ["devices"] = MapList(stmt.Devices, d => (object?)BuildDeviceInfoText(d)),
            ["options"] = MapList(stmt.Options, o => (object?)RestoreOptionText(o)),
        });
    }

    // FileGroupDefinition.StartOffset is unreliable — reconstruct from structured properties.
    private static string BuildFileGroupText(FileGroupDefinition fg) {
        var name = QuotedName(fg.Name) ?? "";
        var suffix = new StringBuilder();
        if (fg.IsDefault) suffix.Append(" DEFAULT");
        if (fg.ContainsFileStream) suffix.Append(" CONTAINS FILESTREAM");
        if (fg.ContainsMemoryOptimizedData) suffix.Append(" CONTAINS MEMORY_OPTIMIZED_DATA");
        var fileParts = fg.FileDeclarations?
            .Select(f => RawText(f))
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();
        var fileStr = fileParts?.Count > 0 ? " " + string.Join(", ", fileParts) : "";
        return name + suffix + fileStr;
    }

    private static SqlNode BuildCreateDatabase(CreateDatabaseStatement stmt) {
        // WITH / (...) options, CONTAINMENT, FOR ATTACH, and AS SNAPSHOT/COPY OF with files
        // stay as written: the options' fragments don't carry their keywords or separators
        if (stmt.Options.Count > 0 || stmt.Containment != null || stmt.AttachMode != AttachMode.None
            || ((stmt.DatabaseSnapshot != null || stmt.CopyOf != null) && stmt.FileGroups.Count > 0))
            return LeafStatement(stmt);
        return Node("CreateDatabaseStatement", stmt, new Dictionary<string, object?> {
            ["name"] = QuotedName(stmt.DatabaseName),
            ["collation"] = stmt.Collation?.Value,
            ["snapshot"] = QuotedName(stmt.DatabaseSnapshot),
            ["copyOf"] = RawTextOrNull(stmt.CopyOf),
            ["fileGroups"] = MapList(stmt.FileGroups, fg => (object?)BuildFileGroupText(fg)),
            ["logOn"] = MapList(stmt.LogOn, l => (object?)RawText(l)),
        });
    }

    // Helper: produce "CURRENT" or the actual database name for ALTER DATABASE statements
    private static string AlterDbName(AlterDatabaseStatement stmt) =>
        stmt.UseCurrent ? "CURRENT" : (QuotedName(stmt.DatabaseName) ?? "");

    /// <summary>
    /// One option of ALTER DATABASE ... SET as text. The option's raw text sometimes omits its
    /// keyword (`RECOVERY FULL` gives "FULL") and sometimes includes it (`QUERY_STORE = ON (...)`),
    /// so the keyword is added only when missing. Whether `=` separates the keyword from the value
    /// (AUTOMATIC_INDEX_COMPACTION = ON, TARGET_RECOVERY_TIME = 60 SECONDS) or not (AUTO_CLOSE ON,
    /// RECOVERY FULL) is read from the token just before the option's fragment.
    /// </summary>
    private static string DatabaseOptionText(AlterDatabaseStatement stmt, DatabaseOption o) {
        var name = DatabaseOptionKindToSql(o.OptionKind);
        var sep = " ";
        var stream = stmt.ScriptTokenStream;
        if (stream != null) {
            var prev = stream
                .Where(t => t.Offset < o.StartOffset && t.TokenType != TSqlTokenType.WhiteSpace)
                .OrderByDescending(t => t.Offset)
                .FirstOrDefault();
            if (prev?.TokenType == TSqlTokenType.EqualsSign) sep = " = ";
        }
        if (o is OnOffDatabaseOption onOff)
            return $"{name}{sep}{(onOff.OptionState == OptionState.On ? "ON" : "OFF")}";
        var val = RawText(o).Trim();
        // The raw text carries its own keyword (FILESTREAM, where the enum name splits it as FILE_STREAM)
        if (val.Replace("_", "").StartsWith(name.Replace("_", ""), StringComparison.OrdinalIgnoreCase)) return val;
        return val.Length > 0 ? $"{name}{sep}{val}" : name;
    }

    private static SqlNode BuildAlterDatabaseSet(AlterDatabaseSetStatement stmt) =>
        Node("AlterDatabaseSetStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            // DatabaseOption raw text sometimes omits the option keyword (e.g. "RECOVERY FULL"
            // gives raw "FULL"), sometimes includes it (e.g. "QUERY_STORE = ON (...)" gives
            // raw "QUERY_STORE = ON (...)"). Prepend only when the raw text lacks the keyword.
            // OnOffDatabaseOption always has raw text of just "ON"/"OFF" (no keyword prefix),
            // and always uses "= ON/OFF" syntax rather than a plain space.
            ["options"] = MapList(stmt.Options, o => (object?)DatabaseOptionText(stmt, o)),
            ["termination"] = RawTextOrNull(stmt.Termination),
        });

    private static SqlNode BuildAlterDatabaseCollate(AlterDatabaseCollateStatement stmt) =>
        Node("AlterDatabaseCollateStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["collation"] = stmt.Collation?.Value,
        });

    private static SqlNode BuildAlterDatabaseModifyName(AlterDatabaseModifyNameStatement stmt) =>
        Node("AlterDatabaseModifyNameStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["newName"] = QuotedName(stmt.NewDatabaseName),
        });

    // ScriptDom bug: AlterDatabaseScopedConfigurationSetStatement.FragmentLength excludes the
    // option value (e.g. "= 4" in "SET MAXDOP = 4" lies outside the statement's fragment span).
    // Collect tokens from the option start until the next semicolon or end-of-file.
    private static string ScopedConfigOptionText(TSqlStatement stmt, TSqlFragment? option) {
        if (option == null) return "";
        var stream = stmt.ScriptTokenStream;
        if (stream == null || stream.Count == 0) return RawText(option);
        var optStart = option.StartOffset;
        var text = string.Concat(stream
            .OrderBy(t => t.Offset)
            .SkipWhile(t => t.Offset < optStart)
            .TakeWhile(t => t.TokenType != TSqlTokenType.Semicolon &&
                            t.TokenType != TSqlTokenType.EndOfFile)
            .Select(t => t.Text));
        return text.Trim();
    }

    private static SqlNode BuildAlterDatabaseScopedConfigSet(AlterDatabaseScopedConfigurationSetStatement stmt) =>
        Node("AlterDatabaseScopedConfigurationSetStatement", stmt, new Dictionary<string, object?> {
            ["option"] = ScopedConfigOptionText(stmt, stmt.Option),
            ["secondary"] = stmt.Secondary,
        });

    private static SqlNode BuildAlterDatabaseScopedConfigClear(AlterDatabaseScopedConfigurationClearStatement stmt) =>
        Node("AlterDatabaseScopedConfigurationClearStatement", stmt, new Dictionary<string, object?> {
            ["option"] = ScopedConfigOptionText(stmt, stmt.Option),
            ["secondary"] = stmt.Secondary,
        });

    private static SqlNode BuildAlterDatabaseAddFile(AlterDatabaseAddFileStatement stmt) =>
        Node("AlterDatabaseAddFileStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["fileGroup"] = QuotedName(stmt.FileGroup),
            ["isLog"] = stmt.IsLog,
            ["files"] = MapList(stmt.FileDeclarations, f => (object?)RawText(f)),
        });

    private static SqlNode BuildAlterDatabaseAddFileGroup(AlterDatabaseAddFileGroupStatement stmt) =>
        Node("AlterDatabaseAddFileGroupStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["fileGroup"] = QuotedName(stmt.FileGroup),
            ["containsFileStream"] = stmt.ContainsFileStream,
            ["containsMemoryOptimized"] = stmt.ContainsMemoryOptimizedData,
        });

    private static SqlNode BuildAlterDatabaseRemoveFile(AlterDatabaseRemoveFileStatement stmt) =>
        Node("AlterDatabaseRemoveFileStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["file"] = QuotedName(stmt.File),
        });

    private static SqlNode BuildAlterDatabaseRemoveFileGroup(AlterDatabaseRemoveFileGroupStatement stmt) =>
        Node("AlterDatabaseRemoveFileGroupStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["fileGroup"] = QuotedName(stmt.FileGroup),
        });

    private static SqlNode BuildAlterDatabaseModifyFile(AlterDatabaseModifyFileStatement stmt) =>
        Node("AlterDatabaseModifyFileStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["file"] = RawTextOrNull(stmt.FileDeclaration),
        });

    private static string ModifyFileGroupOptionToSql(ModifyFileGroupOption opt) => opt switch {
        ModifyFileGroupOption.ReadOnly => "READONLY",
        ModifyFileGroupOption.ReadOnlyOld => "READONLY",
        ModifyFileGroupOption.ReadWrite => "READWRITE",
        ModifyFileGroupOption.ReadWriteOld => "READWRITE",
        ModifyFileGroupOption.AutogrowAllFiles => "AUTOGROW_ALL_FILES",
        ModifyFileGroupOption.AutogrowSingleFile => "AUTOGROW_SINGLE_FILE",
        _ => opt.ToString().ToUpperInvariant(),
    };

    private static SqlNode BuildAlterDatabaseModifyFileGroup(AlterDatabaseModifyFileGroupStatement stmt) =>
        Node("AlterDatabaseModifyFileGroupStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["fileGroup"] = QuotedName(stmt.FileGroup),
            ["makeDefault"] = stmt.MakeDefault,
            ["option"] = !stmt.MakeDefault ? ModifyFileGroupOptionToSql(stmt.UpdatabilityOption) : null,
        });

    private static SqlNode BuildAlterDatabaseRebuildLog(AlterDatabaseRebuildLogStatement stmt) =>
        Node("AlterDatabaseRebuildLogStatement", stmt, new Dictionary<string, object?> {
            ["database"] = AlterDbName(stmt),
            ["file"] = RawTextOrNull(stmt.FileDeclaration),
        });

    // -------------------------------------------------------------------------
    // Extended Events: ALTER EVENT SESSION
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterEventSession(AlterEventSessionStatement aes) {
        var name = QuotedName(aes.Name);
        var scope = aes.SessionScope == EventSessionScope.Server ? "SERVER" : "DATABASE";

        // STATE = START / STATE = STOP — ScriptDOM's FragmentLength excludes the state clause,
        // so we cannot rely on RawText for these forms. Reconstruct explicitly.
        if (aes.StatementType == AlterEventSessionStatementType.AlterStateIsStart) {
            return Node("AlterEventSessionStatement", aes, new Dictionary<string, object?> {
                ["name"] = name,
                ["scope"] = scope,
                ["state"] = "START",
            });
        }
        if (aes.StatementType == AlterEventSessionStatementType.AlterStateIsStop) {
            return Node("AlterEventSessionStatement", aes, new Dictionary<string, object?> {
                ["name"] = name,
                ["scope"] = scope,
                ["state"] = "STOP",
            });
        }

        // Other forms (ADD EVENT, DROP EVENT, ADD TARGET, DROP TARGET, ALTER EVENT) — use raw text.
        return Leaf("Statement", aes, RawText(aes));
    }

    private static SqlNode? BuildOutputClause(OutputClause? output) {
        if (output == null) return null;
        return Node("OutputClause", output, new Dictionary<string, object?> {
            // Use raw text per column: $action, inserted.col, deleted.*, etc. cannot be
            // reliably reconstructed via BuildScalarExpression ($action has a null/zero-length
            // expression fragment in ScriptDom).
            ["columns"] = output.SelectColumns?.Select(c => (object?)Leaf("OutputColumn", c, RawText(c))).ToList(),
        });
    }

    private static SqlNode? BuildOutputIntoClause(OutputIntoClause? output) {
        if (output == null) return null;
        return Node("OutputIntoClause", output, new Dictionary<string, object?> {
            ["columns"] = output.SelectColumns?.Select(c => (object?)Leaf("OutputColumn", c, RawText(c))).ToList(),
            ["into"] = BuildTableReference(output.IntoTable),
            ["intoColumns"] = output.IntoTableColumns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
        });
    }

    // -------------------------------------------------------------------------
    // Security: GRANT / DENY / REVOKE
    // -------------------------------------------------------------------------

    private static Dictionary<string, object?> BuildSecurityBase(SecurityStatement s) => new() {
        ["permissions"] = s.Permissions?.Select(p => (object?)BuildPermission(p)).ToList(),
        ["target"] = BuildSecurityTarget(s.SecurityTargetObject),
        ["principals"] = s.Principals?.Select(p => (object?)BuildSecurityPrincipal(p)).ToList(),
        ["asClause"] = RawTextOrNull(s.AsClause),
    };

    private static SqlNode BuildGrant(GrantStatement s) {
        var props = BuildSecurityBase(s);
        props["withGrantOption"] = s.WithGrantOption;
        return Node("GrantStatement", s, props);
    }

    private static SqlNode BuildDeny(DenyStatement s) {
        var props = BuildSecurityBase(s);
        props["cascade"] = s.CascadeOption;
        return Node("DenyStatement", s, props);
    }

    private static SqlNode BuildRevoke(RevokeStatement s) {
        var props = BuildSecurityBase(s);
        props["grantOptionFor"] = s.GrantOptionFor;
        props["cascade"] = s.CascadeOption;
        return Node("RevokeStatement", s, props);
    }

    private static object? BuildPermission(Permission p) {
        // Join identifier Values to form the permission keyword (e.g. "ALTER ANY USER")
        var name = string.Join(" ", p.Identifiers?.Select(id => id.Value ?? "") ?? []);
        var cols = MapList(p.Columns, c => (object?)RawText(c));
        return new Dictionary<string, object?> { ["name"] = name, ["columns"] = cols };
    }

    private static object? BuildSecurityTarget(SecurityTargetObject? target) {
        if (target == null) return null;
        return new Dictionary<string, object?> {
            ["objectKind"] = target.ObjectKind.ToString(),
            ["objectName"] = RawTextOrNull(target.ObjectName),
            ["columns"] = MapList(target.Columns, c => (object?)RawText(c)),
        };
    }

    private static object? BuildSecurityPrincipal(SecurityPrincipal p) => new Dictionary<string, object?> {
        ["principalType"] = p.PrincipalType.ToString(),
        ["name"] = RawTextOrNull(p.Identifier),
    };

    // -------------------------------------------------------------------------
    // Security: USER / LOGIN / ROLE
    // -------------------------------------------------------------------------

    /// <summary>
    /// A literal as written. Some literals (a CREATE USER password) carry no source offsets,
    /// so <see cref="RawText"/> comes back empty; rebuild a string from its value then.
    /// </summary>
    private static string? LiteralText(Literal? lit) {
        if (lit == null) return null;
        var raw = RawText(lit);
        if (raw.Length > 0 && raw != lit.GetType().Name) return raw;
        return lit is StringLiteral str
            ? (str.IsNational ? "N" : "") + "'" + str.Value.Replace("'", "''") + "'"
            : lit.Value;
    }

    private static object? BuildPrincipalOption(PrincipalOption opt) => opt switch {
        PasswordAlterPrincipalOption popt => new Dictionary<string, object?> {
            ["kind"] = "Password",
            ["password"] = RawTextOrNull(popt.Password),
            ["oldPassword"] = RawTextOrNull(popt.OldPassword),
            ["mustChange"] = popt.MustChange,
            ["unlock"] = popt.Unlock,
            ["hashed"] = popt.Hashed,
        },
        OnOffPrincipalOption onOff => new Dictionary<string, object?> {
            ["kind"] = opt.OptionKind.ToString(),
            ["onOff"] = onOff.OptionState == OptionState.On ? "on" : "off",
        },
        LiteralPrincipalOption litOpt => new Dictionary<string, object?> {
            ["kind"] = opt.OptionKind.ToString(),
            ["value"] = LiteralText(litOpt.Value),
        },
        IdentifierPrincipalOption idOpt => new Dictionary<string, object?> {
            ["kind"] = opt.OptionKind.ToString(),
            ["identifier"] = QuotedName(idOpt.Identifier),
        },
        _ => new Dictionary<string, object?> { ["kind"] = opt.OptionKind.ToString() },
    };

    private static List<object?>? BuildPrincipalOptions<T>(IList<T>? options) where T : class =>
        options?.Count > 0
            ? options.OfType<PrincipalOption>().Select(o => (object?)BuildPrincipalOption(o)).ToList()
            : null;

    // USER

    private static SqlNode BuildCreateUser(CreateUserStatement s) =>
        Node("CreateUserStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["loginOptionType"] = s.UserLoginOption?.UserLoginOptionType.ToString(),
            ["loginOptionId"] = QuotedName(s.UserLoginOption?.Identifier),
            ["options"] = BuildPrincipalOptions(s.UserOptions),
        });

    private static SqlNode BuildAlterUser(AlterUserStatement s) =>
        Node("AlterUserStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["options"] = BuildPrincipalOptions(s.UserOptions),
        });

    private static SqlNode BuildDropUser(DropUserStatement s) =>
        Node("DropUserStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["ifExists"] = s.IsIfExists,
        });

    // LOGIN

    private static SqlNode BuildCreateLogin(CreateLoginStatement s) {
        var props = new Dictionary<string, object?> { ["name"] = QuotedName(s.Name) };
        switch (s.Source) {
            case PasswordCreateLoginSource pcs:
                props["sourceType"] = "Password";
                props["password"] = RawTextOrNull(pcs.Password);
                props["hashed"] = pcs.Hashed;
                props["mustChange"] = pcs.MustChange;
                props["options"] = BuildPrincipalOptions(pcs.Options);
                break;
            case WindowsCreateLoginSource wcs:
                props["sourceType"] = "Windows";
                props["options"] = BuildPrincipalOptions(wcs.Options);
                break;
            case ExternalCreateLoginSource ecs:
                props["sourceType"] = "External";
                props["options"] = BuildPrincipalOptions(ecs.Options);
                break;
            case CertificateCreateLoginSource ccs:
                props["sourceType"] = "Certificate";
                props["sourceName"] = QuotedName(ccs.Certificate);
                break;
            case AsymmetricKeyCreateLoginSource aks:
                props["sourceType"] = "AsymmetricKey";
                props["sourceName"] = QuotedName(aks.Key);
                break;
            default:
                props["sourceType"] = RawTextOrNull(s.Source);
                break;
        }
        return Node("CreateLoginStatement", s, props);
    }

    private static SqlNode BuildAlterLogin(AlterLoginStatement s) => s switch {
        AlterLoginEnableDisableStatement eds => Node("AlterLoginStatement", eds, new Dictionary<string, object?> {
            ["name"] = QuotedName(eds.Name),
            ["action"] = eds.IsEnable ? "Enable" : "Disable",
        }),
        AlterLoginAddDropCredentialStatement cds => Node("AlterLoginStatement", cds, new Dictionary<string, object?> {
            ["name"] = QuotedName(cds.Name),
            ["action"] = cds.IsAdd ? "AddCredential" : "DropCredential",
            ["credentialName"] = QuotedName(cds.CredentialName),
        }),
        AlterLoginOptionsStatement opts => Node("AlterLoginStatement", opts, new Dictionary<string, object?> {
            ["name"] = QuotedName(opts.Name),
            ["action"] = "WithOptions",
            ["options"] = BuildPrincipalOptions(opts.Options),
        }),
        _ => Leaf("AlterLoginStatement", s, RawText(s)),
    };

    private static SqlNode BuildDropLogin(DropLoginStatement s) =>
        Node("DropLoginStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["ifExists"] = s.IsIfExists,
        });

    // ROLE

    private static SqlNode BuildCreateRole(CreateRoleStatement s) =>
        Node("CreateRoleStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["owner"] = QuotedName(s.Owner),
        });

    private static SqlNode BuildAlterRole(AlterRoleStatement s, bool isServer = false) {
        var props = new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["isServer"] = isServer ? (object?)true : null,
        };
        switch (s.Action) {
            case AddMemberAlterRoleAction add:
                props["action"] = "AddMember";
                props["member"] = QuotedName(add.Member);
                break;
            case DropMemberAlterRoleAction drop:
                props["action"] = "DropMember";
                props["member"] = QuotedName(drop.Member);
                break;
            case RenameAlterRoleAction ren:
                props["action"] = "Rename";
                props["newName"] = QuotedName(ren.NewName);
                break;
            default:
                if (s.Action != null) props["action"] = RawText(s.Action);
                break;
        }
        return Node("AlterRoleStatement", s, props);
    }

    private static SqlNode BuildDropRole(DropRoleStatement s) =>
        Node("DropRoleStatement", s, new Dictionary<string, object?> {
            ["name"] = QuotedName(s.Name),
            ["ifExists"] = s.IsIfExists,
        });

    // -------------------------------------------------------------------------
    // Transactions — SAVE TRANSACTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildSaveTransaction(SaveTransactionStatement sv) =>
        Node("SaveTransactionStatement", sv, new Dictionary<string, object?> {
            ["name"] = QuotedName(sv.Name),
        });

    // -------------------------------------------------------------------------
    // Operational — CHECKPOINT / KILL / RECONFIGURE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCheckpoint(CheckpointStatement chk) =>
        Node("CheckpointStatement", chk, new Dictionary<string, object?> {
            ["duration"] = chk.Duration?.Value,
        });

    private static SqlNode BuildKill(KillStatement kll) =>
        Node("KillStatement", kll, new Dictionary<string, object?> {
            ["param"] = RawText(kll.Parameter).Trim(),
            ["withStatusOnly"] = kll.WithStatusOnly,
        });

    private static SqlNode BuildReconfigure(ReconfigureStatement rc) =>
        Node("ReconfigureStatement", rc, new Dictionary<string, object?> {
            ["withOverride"] = rc.WithOverride,
        });

    // -------------------------------------------------------------------------
    // DDL — ENABLE / DISABLE TRIGGER
    // -------------------------------------------------------------------------

    private static SqlNode BuildEnableDisableTrigger(EnableDisableTriggerStatement et) {
        var names = et.TriggerNames?.Select(n => {
            var schema = QuotedName(n.SchemaIdentifier);
            var baseName = QuotedName(n.BaseIdentifier) ?? RawText(n).Trim();
            return (object?)(schema != null ? $"{schema}.{baseName}" : baseName);
        }).ToList();
        var scope = et.TriggerObject?.TriggerScope.ToString() ?? "Normal";
        var targetName = scope == "Normal" ? BuildSchemaObjectName(et.TriggerObject?.Name) : null;
        return Node("EnableDisableTriggerStatement", et, new Dictionary<string, object?> {
            ["enforcement"] = et.TriggerEnforcement.ToString(),
            ["all"] = et.All,
            ["triggerNames"] = names,
            ["targetScope"] = scope,
            ["targetName"] = targetName,
        });
    }

    // -------------------------------------------------------------------------
    // DDL — Statistics
    // -------------------------------------------------------------------------

    /// <summary>The keyword for a statistics option: most are the enum name in capitals, a few are not.</summary>
    private static string StatisticsOptionKeyword(StatisticsOptionKind kind) => kind switch {
        // Written as one word
        StatisticsOptionKind.FullScan => "FULLSCAN",
        StatisticsOptionKind.NoRecompute => "NORECOMPUTE",
        StatisticsOptionKind.RowCount => "ROWCOUNT",
        StatisticsOptionKind.PageCount => "PAGECOUNT",
        StatisticsOptionKind.StatsStream => "STATS_STREAM",
        StatisticsOptionKind.PersistSamplePercent => "PERSIST_SAMPLE_PERCENT",
        _ => System.Text.RegularExpressions.Regex.Replace(kind.ToString(), "(?<=[a-z])(?=[A-Z])", "_").ToUpperInvariant(),
    };

    private static string StatisticsOptionText(StatisticsOption o) => o switch {
        OnOffStatisticsOption oo => $"{StatisticsOptionKeyword(o.OptionKind)} = {(oo.OptionState == OptionState.On ? "ON" : "OFF")}",
        LiteralStatisticsOption lo when o.OptionKind == StatisticsOptionKind.SamplePercent
            => $"SAMPLE {lo.Literal?.Value} PERCENT",
        LiteralStatisticsOption lo when o.OptionKind == StatisticsOptionKind.SampleRows
            => $"SAMPLE {lo.Literal?.Value} ROWS",
        LiteralStatisticsOption lo => $"{StatisticsOptionKeyword(o.OptionKind)} = {lo.Literal?.Value}",
        _ => StatisticsOptionKeyword(o.OptionKind),
    };

    private static SqlNode BuildCreateStatistics(CreateStatisticsStatement cs) {
        var cols = cs.Columns?.Select(c => (object?)(
            QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? RawText(c).Trim()
        )).ToList();
        var opts = cs.StatisticsOptions?.Select(o => (object?)StatisticsOptionText(o)).ToList();
        return Node("CreateStatisticsStatement", cs, new Dictionary<string, object?> {
            ["name"] = QuotedName(cs.Name),
            ["onName"] = BuildSchemaObjectName(cs.OnName),
            ["columns"] = cols,
            ["filterPredicate"] = cs.FilterPredicate != null ? BuildBooleanExpression(cs.FilterPredicate) : null,
            ["options"] = opts,
        });
    }

    private static SqlNode BuildUpdateStatistics(UpdateStatisticsStatement us) {
        var subElems = us.SubElements?.Select(i => (object?)(QuotedName(i) ?? RawText(i).Trim())).ToList();
        var opts = us.StatisticsOptions?.Select(o => (object?)StatisticsOptionText(o)).ToList();
        return Node("UpdateStatisticsStatement", us, new Dictionary<string, object?> {
            ["table"] = BuildSchemaObjectName(us.SchemaObjectName),
            ["subElements"] = subElems,
            ["options"] = opts,
        });
    }

    private static SqlNode BuildDropStatistics(DropStatisticsStatement ds) {
        // Each ChildObjectName has BaseIdentifier (table) and ChildIdentifier (stat name)
        var objects = ds.Objects?.Select(o => (object?)RawText(o).Trim()).ToList();
        return Node("DropStatisticsStatement", ds, new Dictionary<string, object?> {
            ["objects"] = objects,
        });
    }

    // -------------------------------------------------------------------------
    // DDL — CREATE COLUMNSTORE INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateColumnStoreIndex(CreateColumnStoreIndexStatement csi) {
        var cols = csi.Columns?.Select(c => (object?)(
            QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? RawText(c).Trim()
        )).ToList();
        var opts = csi.IndexOptions?.Select(o => (object?)SerializeIndexOption(o)).ToList();
        return Node("CreateColumnStoreIndexStatement", csi, new Dictionary<string, object?> {
            ["name"] = QuotedName(csi.Name),
            ["clustered"] = csi.Clustered,
            ["onName"] = BuildSchemaObjectName(csi.OnName),
            ["columns"] = cols,
            // CREATE CLUSTERED COLUMNSTORE INDEX ... ORDER (a, b)
            ["orderedColumns"] = MapList(csi.OrderedColumns, c =>
                (object?)(QuotedName(c.MultiPartIdentifier?.Identifiers?.LastOrDefault()) ?? RawText(c).Trim())),
            ["filterPredicate"] = csi.FilterPredicate != null ? BuildBooleanExpression(csi.FilterPredicate) : null,
            ["options"] = opts,
            ["onFileGroup"] = StorageTarget(csi.OnFileGroupOrPartitionScheme),
        });
    }

    // -------------------------------------------------------------------------
    // Security — ALTER AUTHORIZATION
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterAuthorization(AlterAuthorizationStatement aa) =>
        Node("AlterAuthorizationStatement", aa, new Dictionary<string, object?> {
            ["target"] = BuildSecurityTarget(aa.SecurityTargetObject),
            ["toSchemaOwner"] = aa.ToSchemaOwner,
            ["principal"] = QuotedName(aa.PrincipalName),
        });
}
