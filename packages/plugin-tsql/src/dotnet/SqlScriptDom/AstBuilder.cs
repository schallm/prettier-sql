using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace PrettierTsql;

/// <summary>
/// Walks the ScriptDom fragment tree and builds a simplified SqlNode tree.
/// </summary>
public class AstBuilder : TSqlFragmentVisitor
{
    private readonly Stack<SqlNode> _stack = new();

    public SqlNode? Root { get; private set; }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static SqlNode Leaf(string type, TSqlFragment f, string? text = null) =>
        new(type, f.StartOffset, f.StartOffset + f.FragmentLength, text, null);

    /// <summary>Reconstructs raw SQL text for a fragment using its token stream.</summary>
    private static string RawText(TSqlFragment f)
    {
        var stream = f.ScriptTokenStream;
        if (stream == null || stream.Count == 0) return f.GetType().Name;
        int start = f.StartOffset;
        int end = start + f.FragmentLength;
        return string.Concat(stream
            .Where(t => t.Offset >= start && t.Offset < end)
            .Select(t => t.Text))
            .Trim();
    }

    private static SqlNode Node(string type, TSqlFragment f, Dictionary<string, object?> props) =>
        new(type, f.StartOffset, f.StartOffset + f.FragmentLength, null, props);

    private static SqlNode? BuildIdentifier(Identifier? id) =>
        id == null ? null : Leaf("Identifier", id, id.Value);

    private static SqlNode? BuildSchemaObjectName(SchemaObjectName? name) =>
        name == null ? null : new SqlNode(
            "SchemaObjectName",
            name.StartOffset,
            name.StartOffset + name.FragmentLength,
            name.BaseIdentifier?.Value,
            new Dictionary<string, object?>
            {
                ["schema"] = name.SchemaIdentifier?.Value,
                ["database"] = name.DatabaseIdentifier?.Value,
                ["server"] = name.ServerIdentifier?.Value,
                ["name"] = name.BaseIdentifier?.Value,
            });

    private static SqlNode? BuildScalarExpression(ScalarExpression? expr)
    {
        if (expr == null) return null;
        return expr switch
        {
            ColumnReferenceExpression col => BuildColumnRef(col),
            IntegerLiteral lit => Leaf("IntegerLiteral", lit, lit.Value),
            StringLiteral str => Leaf("StringLiteral", str, str.Value),
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
            _ => Leaf("ScalarExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildColumnRef(ColumnReferenceExpression col)
    {
        // COUNT(*) uses ColumnType.Wildcard with no identifiers
        if (col.ColumnType == ColumnType.Wildcard)
            return Leaf("WildcardColumn", col, "*");

        var parts = col.MultiPartIdentifier?.Identifiers.Select(i => i.Value).ToList();
        return new SqlNode(
            "ColumnReference",
            col.StartOffset,
            col.StartOffset + col.FragmentLength,
            parts != null ? string.Join(".", parts) : null,
            new Dictionary<string, object?>
            {
                ["parts"] = parts,
            });
    }

    private static SqlNode BuildFunctionCall(FunctionCall fc)
    {
        var args = fc.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var overClause = fc.OverClause != null ? BuildOverClause(fc.OverClause) : null;
        return new SqlNode(
            "FunctionCall",
            fc.StartOffset,
            fc.StartOffset + fc.FragmentLength,
            fc.FunctionName?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = fc.FunctionName?.Value,
                ["args"] = args,
                ["over"] = overClause,
                ["uniqueRowFilter"] = fc.UniqueRowFilter.ToString(),
            });
    }

    private static SqlNode BuildBinaryExpr(BinaryExpression bin) =>
        new SqlNode(
            "BinaryExpression",
            bin.StartOffset,
            bin.StartOffset + bin.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["operator"] = bin.BinaryExpressionType.ToString(),
                ["left"] = BuildScalarExpression(bin.FirstExpression),
                ["right"] = BuildScalarExpression(bin.SecondExpression),
            });

    private static SqlNode BuildUnaryExpr(UnaryExpression un) =>
        new SqlNode(
            "UnaryExpression",
            un.StartOffset,
            un.StartOffset + un.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["operator"] = un.UnaryExpressionType.ToString(),
                ["expr"] = BuildScalarExpression(un.Expression),
            });

    private static SqlNode BuildParenExpr(ParenthesisExpression paren) =>
        new SqlNode(
            "ParenthesisExpression",
            paren.StartOffset,
            paren.StartOffset + paren.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(paren.Expression),
            });

    private static SqlNode BuildCaseExpr(CaseExpression caseExpr)
    {
        if (caseExpr is SimpleCaseExpression simple)
        {
            return new SqlNode(
                "CaseExpression",
                simple.StartOffset,
                simple.StartOffset + simple.FragmentLength,
                null,
                new Dictionary<string, object?>
                {
                    ["caseType"] = "simple",
                    ["input"] = BuildScalarExpression(simple.InputExpression),
                    ["whens"] = simple.WhenClauses?.Select(w => (object?)new SqlNode(
                        "WhenClause",
                        w.StartOffset,
                        w.StartOffset + w.FragmentLength,
                        null,
                        new Dictionary<string, object?>
                        {
                            ["when"] = BuildScalarExpression(w.WhenExpression),
                            ["then"] = BuildScalarExpression(w.ThenExpression),
                        })).ToList(),
                    ["else"] = BuildScalarExpression(simple.ElseExpression),
                });
        }
        else
        {
            // SearchedCaseExpression is the only other concrete subtype of CaseExpression.
            var searched = (SearchedCaseExpression)caseExpr;
            return new SqlNode(
                "CaseExpression",
                searched.StartOffset,
                searched.StartOffset + searched.FragmentLength,
                null,
                new Dictionary<string, object?>
                {
                    ["caseType"] = "searched",
                    ["whens"] = searched.WhenClauses?.Select(w => (object?)new SqlNode(
                        "WhenClause",
                        w.StartOffset,
                        w.StartOffset + w.FragmentLength,
                        null,
                        new Dictionary<string, object?>
                        {
                            ["when"] = BuildBooleanExpression(w.WhenExpression),
                            ["then"] = BuildScalarExpression(w.ThenExpression),
                        })).ToList(),
                    ["else"] = BuildScalarExpression(searched.ElseExpression),
                });
        }
    }

    private static SqlNode BuildCastCall(CastCall cast) =>
        new SqlNode(
            "CastCall",
            cast.StartOffset,
            cast.StartOffset + cast.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(cast.Parameter),
                ["dataType"] = cast.DataType != null ? RawText(cast.DataType) : null,
            });

    private static SqlNode BuildConvertCall(ConvertCall conv) =>
        new SqlNode(
            "ConvertCall",
            conv.StartOffset,
            conv.StartOffset + conv.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(conv.Parameter),
                ["dataType"] = conv.DataType != null ? RawText(conv.DataType) : null,
                ["style"] = BuildScalarExpression(conv.Style),
            });

    private static SqlNode BuildIIfCall(IIfCall iif) =>
        new SqlNode(
            "IIfCall",
            iif.StartOffset,
            iif.StartOffset + iif.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["condition"] = BuildBooleanExpression(iif.Predicate),
                ["trueVal"]   = BuildScalarExpression(iif.ThenExpression),
                ["falseVal"]  = BuildScalarExpression(iif.ElseExpression),
            });

    private static SqlNode BuildCoalesceExpr(CoalesceExpression coalesce) =>
        new SqlNode(
            "CoalesceExpression",
            coalesce.StartOffset,
            coalesce.StartOffset + coalesce.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["args"] = coalesce.Expressions?.Select(e => (object?)BuildScalarExpression(e)).ToList(),
            });

    private static SqlNode BuildNullIfExpr(NullIfExpression nullif) =>
        new SqlNode(
            "NullIfExpression",
            nullif.StartOffset,
            nullif.StartOffset + nullif.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["first"]  = BuildScalarExpression(nullif.FirstExpression),
                ["second"] = BuildScalarExpression(nullif.SecondExpression),
            });

    private static SqlNode BuildTryCastCall(TryCastCall tryCast) =>
        new SqlNode(
            "TryCastCall",
            tryCast.StartOffset,
            tryCast.StartOffset + tryCast.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"]     = BuildScalarExpression(tryCast.Parameter),
                ["dataType"] = tryCast.DataType != null ? RawText(tryCast.DataType) : null,
            });

    private static SqlNode BuildTryConvertCall(TryConvertCall tryConv) =>
        new SqlNode(
            "TryConvertCall",
            tryConv.StartOffset,
            tryConv.StartOffset + tryConv.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"]     = BuildScalarExpression(tryConv.Parameter),
                ["dataType"] = tryConv.DataType != null ? RawText(tryConv.DataType) : null,
                ["style"]    = BuildScalarExpression(tryConv.Style),
            });

    private static SqlNode BuildAtTimeZoneCall(AtTimeZoneCall atz) =>
        new SqlNode(
            "AtTimeZoneCall",
            atz.StartOffset,
            atz.StartOffset + atz.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["source"]   = BuildScalarExpression(atz.DateValue),
                ["timeZone"] = BuildScalarExpression(atz.TimeZone),
            });

    private static SqlNode BuildScalarSubquery(ScalarSubquery sub) =>
        new SqlNode(
            "ScalarSubquery",
            sub.StartOffset,
            sub.StartOffset + sub.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["query"] = BuildQueryExpression(sub.QueryExpression),
            });

    private static SqlNode? BuildBooleanExpression(BooleanExpression? expr)
    {
        if (expr == null) return null;
        return expr switch
        {
            BooleanComparisonExpression cmp => BuildBooleanComparison(cmp),
            BooleanBinaryExpression bin => BuildBooleanBinary(bin),
            BooleanNotExpression not => BuildBooleanNot(not),
            BooleanParenthesisExpression paren => BuildBooleanParen(paren),
            BooleanIsNullExpression isNull => BuildBooleanIsNull(isNull),
            InPredicate inPred => BuildInPredicate(inPred),
            LikePredicate like => BuildLikePredicate(like),
            ExistsPredicate exists => BuildExistsPredicate(exists),
            BooleanTernaryExpression between => BuildBetween(between),
            _ => Leaf("BooleanExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildBooleanComparison(BooleanComparisonExpression cmp) =>
        new SqlNode(
            "BooleanComparison",
            cmp.StartOffset,
            cmp.StartOffset + cmp.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["operator"] = cmp.ComparisonType.ToString(),
                ["left"] = BuildScalarExpression(cmp.FirstExpression),
                ["right"] = BuildScalarExpression(cmp.SecondExpression),
            });

    private static SqlNode BuildBooleanBinary(BooleanBinaryExpression bin) =>
        new SqlNode(
            "BooleanBinary",
            bin.StartOffset,
            bin.StartOffset + bin.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["operator"] = bin.BinaryExpressionType.ToString(),
                ["left"] = BuildBooleanExpression(bin.FirstExpression),
                ["right"] = BuildBooleanExpression(bin.SecondExpression),
            });

    private static SqlNode BuildBooleanNot(BooleanNotExpression not) =>
        new SqlNode(
            "BooleanNot",
            not.StartOffset,
            not.StartOffset + not.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildBooleanExpression(not.Expression),
            });

    private static SqlNode BuildBooleanParen(BooleanParenthesisExpression paren) =>
        new SqlNode(
            "BooleanParenthesis",
            paren.StartOffset,
            paren.StartOffset + paren.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildBooleanExpression(paren.Expression),
            });

    private static SqlNode BuildBooleanIsNull(BooleanIsNullExpression isNull) =>
        new SqlNode(
            "IsNullExpression",
            isNull.StartOffset,
            isNull.StartOffset + isNull.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(isNull.Expression),
                ["isNot"] = isNull.IsNot,
            });

    private static SqlNode BuildInPredicate(InPredicate inPred) =>
        new SqlNode(
            "InPredicate",
            inPred.StartOffset,
            inPred.StartOffset + inPred.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(inPred.Expression),
                ["negated"] = inPred.NotDefined,
                ["values"] = inPred.Values?.Select(v => (object?)BuildScalarExpression(v)).ToList(),
                ["subquery"] = inPred.Subquery != null ? BuildQueryExpression(inPred.Subquery.QueryExpression) : null,
            });

    private static SqlNode BuildLikePredicate(LikePredicate like) =>
        new SqlNode(
            "LikePredicate",
            like.StartOffset,
            like.StartOffset + like.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(like.FirstExpression),
                ["pattern"] = BuildScalarExpression(like.SecondExpression),
                ["negated"] = like.NotDefined,
                ["escape"] = BuildScalarExpression(like.EscapeExpression),
            });

    private static SqlNode BuildExistsPredicate(ExistsPredicate exists) =>
        new SqlNode(
            "ExistsPredicate",
            exists.StartOffset,
            exists.StartOffset + exists.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["subquery"] = BuildQueryExpression(exists.Subquery?.QueryExpression),
            });

    private static SqlNode BuildBetween(BooleanTernaryExpression between) =>
        new SqlNode(
            "BetweenExpression",
            between.StartOffset,
            between.StartOffset + between.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expr"] = BuildScalarExpression(between.FirstExpression),
                ["from"] = BuildScalarExpression(between.SecondExpression),
                ["to"] = BuildScalarExpression(between.ThirdExpression),
                ["negated"] = between.TernaryExpressionType == BooleanTernaryExpressionType.NotBetween,
            });

    private static SqlNode? BuildTableReference(TableReference? tableRef)
    {
        if (tableRef == null) return null;
        return tableRef switch
        {
            NamedTableReference named => BuildNamedTableRef(named),
            VariableTableReference varRef => Leaf("VariableTableReference", varRef, varRef.Variable?.Name),
            QualifiedJoin qj => BuildQualifiedJoin(qj),
            UnqualifiedJoin uj => BuildUnqualifiedJoin(uj),
            QueryDerivedTable sub => BuildQueryDerivedTable(sub),
            JoinParenthesisTableReference jp => BuildJoinParenthesis(jp),
            SchemaObjectFunctionTableReference tvf => BuildSchemaObjectFunctionTableRef(tvf),
            _ => Leaf("TableReference", tableRef, RawText(tableRef)),
        };
    }

    private static SqlNode BuildNamedTableRef(NamedTableReference named)
    {
        var hints = named.TableHints?.Count > 0
            ? named.TableHints.Select(h => (object?)h.HintKind.ToString().ToUpper()).ToList()
            : null;
        return new SqlNode(
            "NamedTableReference",
            named.StartOffset,
            named.StartOffset + named.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"] = BuildSchemaObjectName(named.SchemaObject),
                ["alias"] = named.Alias?.Value,
                ["hints"] = hints,
            });
    }

    private static SqlNode BuildQualifiedJoin(QualifiedJoin qj) =>
        new SqlNode(
            "QualifiedJoin",
            qj.StartOffset,
            qj.StartOffset + qj.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["joinType"] = qj.QualifiedJoinType.ToString(),
                ["left"] = BuildTableReference(qj.FirstTableReference),
                ["right"] = BuildTableReference(qj.SecondTableReference),
                ["condition"] = BuildBooleanExpression(qj.SearchCondition),
            });

    private static SqlNode BuildUnqualifiedJoin(UnqualifiedJoin uj) =>
        new SqlNode(
            "UnqualifiedJoin",
            uj.StartOffset,
            uj.StartOffset + uj.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["joinType"] = uj.UnqualifiedJoinType.ToString(),
                ["left"] = BuildTableReference(uj.FirstTableReference),
                ["right"] = BuildTableReference(uj.SecondTableReference),
            });

    private static SqlNode BuildJoinParenthesis(JoinParenthesisTableReference jp) =>
        new SqlNode(
            "JoinParenthesisTableReference",
            jp.StartOffset,
            jp.StartOffset + jp.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["join"] = BuildTableReference(jp.Join),
            });

    private static SqlNode BuildQueryDerivedTable(QueryDerivedTable sub) =>
        new SqlNode(
            "QueryDerivedTable",
            sub.StartOffset,
            sub.StartOffset + sub.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["query"] = BuildQueryExpression(sub.QueryExpression),
                ["alias"] = sub.Alias?.Value,
            });

    private static SqlNode BuildSchemaObjectFunctionTableRef(SchemaObjectFunctionTableReference tvf)
    {
        var args = tvf.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        return new SqlNode(
            "SchemaObjectFunctionTableReference",
            tvf.StartOffset,
            tvf.StartOffset + tvf.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"]  = BuildSchemaObjectName(tvf.SchemaObject),
                ["args"]  = args,
                ["alias"] = tvf.Alias?.Value,
            });
    }

    private static SqlNode? BuildQueryExpression(QueryExpression? expr)
    {
        if (expr == null) return null;
        return expr switch
        {
            QuerySpecification qs => BuildQuerySpec(qs),
            BinaryQueryExpression bq => BuildBinaryQuery(bq),
            QueryParenthesisExpression qp => BuildQueryParen(qp),
            _ => Leaf("QueryExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildQuerySpec(QuerySpecification qs)
    {
        var selectElements = qs.SelectElements?.Select(se => (object?)BuildSelectElement(se)).ToList();
        var topRowFilter = qs.TopRowFilter != null ? BuildTopRowFilter(qs.TopRowFilter) : null;
        var fromClause = qs.FromClause != null ? BuildFromClause(qs.FromClause) : null;
        var whereClause = qs.WhereClause != null ? BuildBooleanExpression(qs.WhereClause.SearchCondition) : null;
        var groupByClause = qs.GroupByClause != null ? BuildGroupByClause(qs.GroupByClause) : null;
        var havingClause = qs.HavingClause != null ? BuildBooleanExpression(qs.HavingClause.SearchCondition) : null;
        var orderByClause = qs.OrderByClause != null ? BuildOrderByClause(qs.OrderByClause) : null;
        var uniqueRowFilter = qs.UniqueRowFilter.ToString();

        return new SqlNode(
            "QuerySpecification",
            qs.StartOffset,
            qs.StartOffset + qs.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["uniqueRowFilter"] = uniqueRowFilter,
                ["top"] = topRowFilter,
                ["selectElements"] = selectElements,
                ["from"] = fromClause,
                ["where"] = whereClause,
                ["groupBy"] = groupByClause,
                ["having"] = havingClause,
                ["orderBy"] = orderByClause,
            });
    }

    private static SqlNode BuildTopRowFilter(TopRowFilter top) =>
        new SqlNode(
            "TopRowFilter",
            top.StartOffset,
            top.StartOffset + top.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expression"] = BuildScalarExpression(top.Expression),
                ["percent"] = top.Percent,
                ["withTies"] = top.WithTies,
            });

    private static SqlNode? BuildSelectElement(SelectElement se)
    {
        if (se == null) return null;
        return se switch
        {
            SelectStarExpression star => Leaf("SelectStar", star, RawText(star)),
            SelectScalarExpression scalar => new SqlNode(
                "SelectScalar",
                scalar.StartOffset,
                scalar.StartOffset + scalar.FragmentLength,
                null,
                new Dictionary<string, object?>
                {
                    ["expression"] = BuildScalarExpression(scalar.Expression),
                    ["alias"] = scalar.ColumnName?.Value,
                }),
            SelectSetVariable sv => Node("SelectSetVariable", sv, new Dictionary<string, object?>
            {
                ["variable"] = sv.Variable?.Name,
                ["operator"] = sv.AssignmentKind.ToString(),
                ["value"]    = BuildScalarExpression(sv.Expression),
            }),
            _ => Leaf("SelectElement", se, RawText(se)),
        };
    }

    private static SqlNode BuildFromClause(FromClause fc)
    {
        var tableRefs = fc.TableReferences?.Select(tr => (object?)BuildTableReference(tr)).ToList();
        return new SqlNode(
            "FromClause",
            fc.StartOffset,
            fc.StartOffset + fc.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["tableReferences"] = tableRefs,
            });
    }

    private static SqlNode BuildGroupByClause(GroupByClause gb)
    {
        var elements = gb.GroupingSpecifications?.Select(gs => (object?)BuildGroupingSpec(gs)).ToList();
        return new SqlNode(
            "GroupByClause",
            gb.StartOffset,
            gb.StartOffset + gb.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["elements"] = elements,
            });
    }

    private static SqlNode? BuildGroupingSpec(GroupingSpecification gs)
    {
        if (gs is ExpressionGroupingSpecification expr)
            return BuildScalarExpression(expr.Expression);
        if (gs is RollupGroupingSpecification rollup)
            return Node("RollupSpec", rollup, new Dictionary<string, object?> {
                ["expressions"] = rollup.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList(),
            });
        if (gs is CubeGroupingSpecification cube)
            return Node("CubeSpec", cube, new Dictionary<string, object?> {
                ["expressions"] = cube.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList(),
            });
        if (gs is GroupingSetsGroupingSpecification gsets)
            return Node("GroupingSetsSpec", gsets, new Dictionary<string, object?> {
                ["sets"] = gsets.Sets?.Select(e => (object?)BuildGroupingSpec(e)).ToList(),
            });
        if (gs is CompositeGroupingSpecification composite)
            return Node("CompositeGroupingSpec", composite, new Dictionary<string, object?> {
                ["items"] = composite.Items?.Select(e => (object?)BuildGroupingSpec(e)).ToList(),
            });
        if (gs is GrandTotalGroupingSpecification)
            return Leaf("GrandTotalSpec", gs, "()");
        return Leaf("GroupingSpecification", gs, RawText(gs));
    }

    private static SqlNode BuildOrderByClause(OrderByClause ob)
    {
        var elements = ob.OrderByElements?.Select(e => (object?)BuildOrderByElement(e)).ToList();
        return new SqlNode(
            "OrderByClause",
            ob.StartOffset,
            ob.StartOffset + ob.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["elements"] = elements,
            });
    }

    private static SqlNode BuildOrderByElement(ExpressionWithSortOrder e) =>
        new SqlNode(
            "OrderByElement",
            e.StartOffset,
            e.StartOffset + e.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["expression"] = BuildScalarExpression(e.Expression),
                ["sortOrder"] = e.SortOrder.ToString(),
            });

    private static SqlNode BuildBinaryQuery(BinaryQueryExpression bq) =>
        new SqlNode(
            "BinaryQueryExpression",
            bq.StartOffset,
            bq.StartOffset + bq.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["operator"] = bq.BinaryQueryExpressionType.ToString(),
                ["all"] = bq.All,
                ["left"] = BuildQueryExpression(bq.FirstQueryExpression),
                ["right"] = BuildQueryExpression(bq.SecondQueryExpression),
            });

    private static SqlNode BuildQueryParen(QueryParenthesisExpression qp) =>
        new SqlNode(
            "QueryParenthesis",
            qp.StartOffset,
            qp.StartOffset + qp.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["query"] = BuildQueryExpression(qp.QueryExpression),
            });

    private static SqlNode BuildOverClause(OverClause over)
    {
        var partitionBy = over.Partitions?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var orderBy = over.OrderByClause != null ? BuildOrderByClause(over.OrderByClause) : null;
        return new SqlNode(
            "OverClause",
            over.StartOffset,
            over.StartOffset + over.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["partitionBy"] = partitionBy,
                ["orderBy"] = orderBy,
            });
    }

    // -------------------------------------------------------------------------
    // Visitor overrides — we handle at the statement level
    // -------------------------------------------------------------------------

    public override void Visit(TSqlScript script)
    {
        var batches = script.Batches?.Select(b => (object?)BuildBatch(b)).ToList();
        Root = new SqlNode(
            "TSqlScript",
            script.StartOffset,
            script.StartOffset + script.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["batches"] = batches,
            });
    }

    private static SqlNode BuildBatch(TSqlBatch batch)
    {
        var stmts = batch.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return new SqlNode(
            "TSqlBatch",
            batch.StartOffset,
            batch.StartOffset + batch.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["statements"] = stmts,
            });
    }

    private static SqlNode? BuildStatement(TSqlStatement stmt)
    {
        if (stmt == null) return null;
        return stmt switch
        {
            SelectStatement sel => BuildSelectStatement(sel),
            InsertStatement ins => BuildInsertStatement(ins),
            UpdateStatement upd => BuildUpdateStatement(upd),
            DeleteStatement del => BuildDeleteStatement(del),
            CreateTableStatement ct => BuildCreateTableStatement(ct),
            AlterTableStatement at => BuildAlterTableStatement(at),
            CreateIndexStatement ci => BuildCreateIndexStatement(ci),
            CreateOrAlterProcedureStatement cap => BuildCreateOrAlterProcedure(cap),
            CreateProcedureStatement cp => BuildCreateProcedureStatement(cp),
            CreateFunctionStatement cf => BuildCreateFunctionStatement(cf),
            CreateViewStatement cv => BuildViewStatement("CreateViewStatement", cv),
            AlterViewStatement av => BuildViewStatement("AlterViewStatement", av),
            CreateOrAlterViewStatement coav => BuildViewStatement("CreateOrAlterViewStatement", coav),
            BeginEndBlockStatement begin => BuildBeginEnd(begin),
            BeginTransactionStatement bt => BuildBeginTransaction(bt),
            CommitTransactionStatement ct => BuildCommitTransaction(ct),
            RollbackTransactionStatement rt => BuildRollbackTransaction(rt),
            DeclareVariableStatement dv => BuildDeclareVariable(dv),
            DeclareTableVariableStatement dtv => BuildDeclareTableVariable(dtv),
            SetVariableStatement sv => BuildSetVariable(sv),
            SetRowCountStatement src => BuildSetRowCount(src),
            PrintStatement ps => BuildPrint(ps),
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
            DropTableStatement dts => BuildDropObjects("DropTableStatement", dts),
            DropProcedureStatement dps => BuildDropObjects("DropProcedureStatement", dps),
            DropViewStatement dvs => BuildDropObjects("DropViewStatement", dvs),
            DropFunctionStatement dfs => BuildDropObjects("DropFunctionStatement", dfs),
            DropIndexStatement di => BuildDropIndex(di),
            MergeStatement merge => BuildMergeStatement(merge),
            _ => Leaf("Statement", stmt, RawText(stmt)),
        };
    }

    // -------------------------------------------------------------------------
    // DML: SELECT
    // -------------------------------------------------------------------------

    private static SqlNode BuildSelectStatement(SelectStatement sel)
    {
        var ctes = sel.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();

        var optimizerHints = sel.OptimizerHints?.Count > 0
            ? sel.OptimizerHints.Select(h => (object?)BuildOptimizerHint(h)).ToList()
            : null;

        return new SqlNode(
            "SelectStatement",
            sel.StartOffset,
            sel.StartOffset + sel.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["ctes"] = ctes,
                ["queryExpression"] = BuildQueryExpression(sel.QueryExpression),
                ["optimizerHints"] = optimizerHints,
            });
    }

    private static string BuildOptimizerHint(OptimizerHint hint)
    {
        var kind = hint.HintKind switch
        {
            OptimizerHintKind.Recompile       => "RECOMPILE",
            OptimizerHintKind.MaxDop          => "MAXDOP",
            OptimizerHintKind.ForceOrder      => "FORCE ORDER",
            OptimizerHintKind.ExpandViews     => "EXPAND VIEWS",
            OptimizerHintKind.KeepPlan        => "KEEP PLAN",
            OptimizerHintKind.KeepFixedPlan   => "KEEPFIXED PLAN",
            OptimizerHintKind.LoopJoin        => "LOOP JOIN",
            OptimizerHintKind.HashJoin        => "HASH JOIN",
            OptimizerHintKind.MergeJoin       => "MERGE JOIN",
            OptimizerHintKind.HashGroup       => "HASH GROUP",
            OptimizerHintKind.OrderGroup      => "ORDER GROUP",
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
            cte.ExpressionName?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = cte.ExpressionName?.Value,
                ["columns"] = cte.Columns?.Select(c => (object?)c.Value).ToList(),
                ["query"] = BuildQueryExpression(cte.QueryExpression),
            });

    // -------------------------------------------------------------------------
    // DML: INSERT
    // -------------------------------------------------------------------------

    private static SqlNode BuildInsertStatement(InsertStatement ins)
    {
        var spec = ins.InsertSpecification;
        if (spec == null) return Leaf("InsertStatement", ins);

        var ctes = ins.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var columns = spec.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList();
        SqlNode? source = spec.InsertSource switch
        {
            ValuesInsertSource vals => BuildValuesInsertSource(vals),
            SelectInsertSource sel => BuildQueryExpression(sel.Select),
            _ => spec.InsertSource != null
                ? Leaf("InsertSource", spec.InsertSource, RawText(spec.InsertSource))
                : null,
        };

        return new SqlNode(
            "InsertStatement",
            ins.StartOffset,
            ins.StartOffset + ins.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["ctes"]       = ctes,
                ["target"]     = target,
                ["columns"]    = columns,
                ["source"]     = source,
                ["output"]     = BuildOutputClause(spec.OutputClause),
                ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
            });
    }

    private static SqlNode BuildValuesInsertSource(ValuesInsertSource vals)
    {
        var rows = vals.RowValues?.Select(rv =>
        {
            var values = rv.ColumnValues?.Select(cv => (object?)BuildScalarExpression(cv)).ToList();
            return (object?)new SqlNode(
                "ValuesRow",
                rv.StartOffset,
                rv.StartOffset + rv.FragmentLength,
                null,
                new Dictionary<string, object?> { ["values"] = values });
        }).ToList();

        return new SqlNode(
            "ValuesSource",
            vals.StartOffset,
            vals.StartOffset + vals.FragmentLength,
            null,
            new Dictionary<string, object?> { ["rows"] = rows });
    }

    // -------------------------------------------------------------------------
    // DML: UPDATE
    // -------------------------------------------------------------------------

    private static SqlNode BuildUpdateStatement(UpdateStatement upd)
    {
        var spec = upd.UpdateSpecification;
        if (spec == null) return Leaf("UpdateStatement", upd);

        var ctes = upd.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var setClauses = spec.SetClauses?.Select(sc => (object?)BuildSetClause(sc)).ToList();
        var fromClause = spec.FromClause != null ? BuildFromClause(spec.FromClause) : null;
        var whereClause = spec.WhereClause != null ? BuildBooleanExpression(spec.WhereClause.SearchCondition) : null;

        return new SqlNode(
            "UpdateStatement",
            upd.StartOffset,
            upd.StartOffset + upd.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["ctes"]       = ctes,
                ["target"]     = target,
                ["set"]        = setClauses,
                ["from"]       = fromClause,
                ["where"]      = whereClause,
                ["output"]     = BuildOutputClause(spec.OutputClause),
                ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
            });
    }

    private static SqlNode BuildSetClause(SetClause sc)
    {
        if (sc is AssignmentSetClause asc)
        {
            return new SqlNode(
                "AssignmentSetClause",
                asc.StartOffset,
                asc.StartOffset + asc.FragmentLength,
                null,
                new Dictionary<string, object?>
                {
                    ["column"] = BuildColumnRef(asc.Column),
                    ["operator"] = asc.AssignmentKind.ToString(),
                    ["value"] = BuildScalarExpression(asc.NewValue),
                });
        }
        return Leaf("SetClause", sc, RawText(sc));
    }

    // -------------------------------------------------------------------------
    // DML: DELETE
    // -------------------------------------------------------------------------

    private static SqlNode BuildDeleteStatement(DeleteStatement del)
    {
        var spec = del.DeleteSpecification;
        if (spec == null) return Leaf("DeleteStatement", del);

        var ctes = del.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        var target = BuildTableReference(spec.Target);
        var fromClause = spec.FromClause != null ? BuildFromClause(spec.FromClause) : null;
        var whereClause = spec.WhereClause != null ? BuildBooleanExpression(spec.WhereClause.SearchCondition) : null;

        return new SqlNode(
            "DeleteStatement",
            del.StartOffset,
            del.StartOffset + del.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["ctes"]       = ctes,
                ["target"]     = target,
                ["from"]       = fromClause,
                ["where"]      = whereClause,
                ["output"]     = BuildOutputClause(spec.OutputClause),
                ["outputInto"] = BuildOutputIntoClause(spec.OutputIntoClause),
            });
    }

    private static SqlNode BuildBeginTransaction(BeginTransactionStatement bt) =>
        new SqlNode("BeginTransactionStatement", bt.StartOffset, bt.StartOffset + bt.FragmentLength, null,
            new Dictionary<string, object?> { ["name"] = bt.Name?.Identifier?.Value });

    private static SqlNode BuildCommitTransaction(CommitTransactionStatement ct) =>
        new SqlNode("CommitTransactionStatement", ct.StartOffset, ct.StartOffset + ct.FragmentLength, null,
            new Dictionary<string, object?> { ["name"] = ct.Name?.Identifier?.Value });

    private static SqlNode BuildRollbackTransaction(RollbackTransactionStatement rt) =>
        new SqlNode("RollbackTransactionStatement", rt.StartOffset, rt.StartOffset + rt.FragmentLength, null,
            new Dictionary<string, object?> { ["name"] = rt.Name?.Identifier?.Value });

    private static SqlNode BuildDeclareVariable(DeclareVariableStatement dv)
    {
        var decls = dv.Declarations?.Select(d => (object?)BuildDeclareElement(d)).ToList();
        return new SqlNode("DeclareVariableStatement", dv.StartOffset, dv.StartOffset + dv.FragmentLength, null,
            new Dictionary<string, object?> { ["declarations"] = decls });
    }

    private static SqlNode BuildDeclareElement(DeclareVariableElement d) =>
        new SqlNode("DeclareVariableElement", d.StartOffset, d.StartOffset + d.FragmentLength, d.VariableName?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = d.VariableName?.Value,
                ["dataType"] = d.DataType?.Name?.BaseIdentifier?.Value,
                ["dataTypeParams"] = d.DataType is ParameterizedDataTypeReference pdt
                    ? pdt.Parameters?.Select(p => (object?)p.Value).ToList()
                    : null,
                ["value"] = BuildScalarExpression(d.Value),
            });

    private static SqlNode BuildDeclareTableVariable(DeclareTableVariableStatement dtv)
    {
        var body = dtv.Body;
        var columns = body?.Definition?.ColumnDefinitions?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = body?.Definition?.TableConstraints?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        return new SqlNode("DeclareTableVariableStatement", dtv.StartOffset, dtv.StartOffset + dtv.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["name"] = body?.VariableName?.Value,
                ["columns"] = columns,
                ["constraints"] = constraints,
            });
    }

    private static SqlNode BuildSetVariable(SetVariableStatement sv) =>
        new SqlNode("SetVariableStatement", sv.StartOffset, sv.StartOffset + sv.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["name"] = sv.Variable?.Name,
                ["value"] = BuildScalarExpression(sv.Expression),
                ["operator"] = sv.AssignmentKind.ToString(),
            });

    private static SqlNode BuildSetRowCount(SetRowCountStatement src) =>
        new SqlNode("SetRowCountStatement", src.StartOffset, src.StartOffset + src.FragmentLength, null,
            new Dictionary<string, object?> { ["rows"] = BuildScalarExpression(src.NumberRows) });

    private static SqlNode BuildPrint(PrintStatement ps) =>
        new SqlNode("PrintStatement", ps.StartOffset, ps.StartOffset + ps.FragmentLength, null,
            new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(ps.Expression) });

    private static SqlNode BuildReturn(ReturnStatement rs) =>
        new SqlNode("ReturnStatement", rs.StartOffset, rs.StartOffset + rs.FragmentLength, null,
            new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(rs.Expression) });

    private static SqlNode BuildIf(IfStatement ifs) =>
        new SqlNode("IfStatement", ifs.StartOffset, ifs.StartOffset + ifs.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["condition"] = BuildBooleanExpression(ifs.Predicate),
                ["then"] = BuildStatement(ifs.ThenStatement),
                ["else"] = ifs.ElseStatement != null ? BuildStatement(ifs.ElseStatement) : null,
            });

    private static SqlNode BuildWhile(WhileStatement ws) =>
        new SqlNode("WhileStatement", ws.StartOffset, ws.StartOffset + ws.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["condition"] = BuildBooleanExpression(ws.Predicate),
                ["body"] = BuildStatement(ws.Statement),
            });

    private static SqlNode BuildExecute(ExecuteStatement es)
    {
        var spec = es.ExecuteSpecification;
        var execProc = spec?.ExecutableEntity as ExecutableProcedureReference;
        var procNode = execProc != null
            ? BuildSchemaObjectName(execProc.ProcedureReference?.ProcedureReference?.Name)
            : null;

        var procParams = execProc?.Parameters;
        var parameters = procParams?.Select(p => (object?)new SqlNode(
            "ExecuteParameter",
            p.StartOffset, p.StartOffset + p.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["name"] = p.Variable?.Name,
                ["value"] = BuildScalarExpression(p.ParameterValue),
                ["output"] = p.IsOutput,
            })).ToList();

        return new SqlNode("ExecuteStatement", es.StartOffset, es.StartOffset + es.FragmentLength, null,
            new Dictionary<string, object?>
            {
                ["proc"] = procNode,
                ["parameters"] = parameters,
            });
    }

    private static SqlNode BuildBeginEnd(BeginEndBlockStatement begin)
    {
        var stmts = begin.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return new SqlNode(
            "BeginEndBlock",
            begin.StartOffset,
            begin.StartOffset + begin.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["statements"] = stmts,
            });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE TABLE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateTableStatement(CreateTableStatement ct)
    {
        var columns = ct.Definition?.ColumnDefinitions
            ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = ct.Definition?.TableConstraints
            ?.Select(c => (object?)BuildTableConstraint(c)).ToList();

        return new SqlNode(
            "CreateTableStatement",
            ct.StartOffset,
            ct.StartOffset + ct.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"] = BuildSchemaObjectName(ct.SchemaObjectName),
                ["columns"] = columns,
                ["constraints"] = constraints,
            });
    }

    private static SqlNode BuildColumnDefinition(ColumnDefinition col)
    {
        var dt = col.DataType;
        string? dataTypeName = dt?.Name?.BaseIdentifier?.Value;

        return new SqlNode(
            "ColumnDefinition",
            col.StartOffset,
            col.StartOffset + col.FragmentLength,
            col.ColumnIdentifier?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = col.ColumnIdentifier?.Value,
                ["dataType"] = dataTypeName,
                ["dataTypeParams"] = dt is ParameterizedDataTypeReference pdt
                    ? pdt.Parameters?.Select(p => (object?)p.Value).ToList()
                    : null,
                ["nullable"] = col.Constraints?.OfType<NullableConstraintDefinition>()
                    .FirstOrDefault()?.Nullable,
                ["identity"] = col.IdentityOptions != null,
                ["identitySeed"] = (col.IdentityOptions?.IdentitySeed as Literal)?.Value,
                ["identityIncrement"] = (col.IdentityOptions?.IdentityIncrement as Literal)?.Value,
                ["defaultValue"] = col.DefaultConstraint != null
                    ? BuildScalarExpression(col.DefaultConstraint.Expression)
                    : null,
            });
    }

    private static SqlNode BuildTableConstraint(ConstraintDefinition c)
    {
        var name = c.ConstraintIdentifier?.Value;
        return c switch
        {
            UniqueConstraintDefinition unique => new SqlNode(
                "UniqueConstraint",
                unique.StartOffset,
                unique.StartOffset + unique.FragmentLength,
                name,
                new Dictionary<string, object?>
                {
                    ["constraintName"] = name,
                    ["isPrimaryKey"] = unique.IsPrimaryKey,
                    ["columns"] = unique.Columns?.Select(col => (object?)col.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()?.Value).ToList(),
                }),
            CheckConstraintDefinition check => new SqlNode(
                "CheckConstraint",
                check.StartOffset,
                check.StartOffset + check.FragmentLength,
                name,
                new Dictionary<string, object?>
                {
                    ["constraintName"] = name,
                    ["expression"] = BuildBooleanExpression(check.CheckCondition),
                }),
            ForeignKeyConstraintDefinition fk => new SqlNode(
                "ForeignKeyConstraint",
                fk.StartOffset,
                fk.StartOffset + fk.FragmentLength,
                name,
                new Dictionary<string, object?>
                {
                    ["constraintName"] = name,
                    ["columns"] = fk.Columns?.Select(col => (object?)col.Value).ToList(),
                    ["refTable"] = BuildSchemaObjectName(fk.ReferenceTableName),
                    ["refColumns"] = fk.ReferencedTableColumns?.Select(col => (object?)col.Value).ToList(),
                }),
            _ => Leaf("TableConstraint", c, RawText(c)),
        };
    }

    // -------------------------------------------------------------------------
    // DDL: ALTER TABLE
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterTableStatement(AlterTableStatement at)
    {
        string alterType = at.GetType().Name;
        var props = new Dictionary<string, object?>
        {
            ["name"] = BuildSchemaObjectName(at.SchemaObjectName),
            ["alterType"] = alterType,
        };

        if (at is AlterTableAddTableElementStatement addElem)
        {
            props["columns"] = addElem.Definition?.ColumnDefinitions
                ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
            props["constraints"] = addElem.Definition?.TableConstraints
                ?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        }
        else if (at is AlterTableDropTableElementStatement dropElem)
        {
            props["elements"] = dropElem.AlterTableDropTableElements
                ?.Select(e => (object?)e.Name?.Value).ToList();
        }

        return new SqlNode(
            "AlterTableStatement",
            at.StartOffset,
            at.StartOffset + at.FragmentLength,
            null,
            props);
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateIndexStatement(CreateIndexStatement ci)
    {
        var cols = ci.Columns?.Select(c => (object?)new SqlNode(
            "IndexColumn",
            c.StartOffset,
            c.StartOffset + c.FragmentLength,
            c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = c.Column?.MultiPartIdentifier?.Identifiers.LastOrDefault()?.Value,
                ["sortOrder"] = c.SortOrder.ToString(),
            })).ToList();

        return new SqlNode(
            "CreateIndexStatement",
            ci.StartOffset,
            ci.StartOffset + ci.FragmentLength,
            ci.Name?.Value,
            new Dictionary<string, object?>
            {
                ["indexName"] = ci.Name?.Value,
                ["unique"] = ci.Unique,
                ["clustered"] = ci.Clustered,
                ["table"] = BuildSchemaObjectName(ci.OnName),
                ["columns"] = cols,
                ["includeColumns"] = ci.IncludeColumns?.Select(c => (object?)c.MultiPartIdentifier?.Identifiers.LastOrDefault()?.Value).ToList(),
            });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE PROCEDURE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateProcedureStatement(CreateProcedureStatement cp)
    {
        var parms = cp.Parameters?.Select(p => (object?)BuildProcedureParameter(p)).ToList();
        var stmts = cp.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();

        return new SqlNode(
            "CreateProcedureStatement",
            cp.StartOffset,
            cp.StartOffset + cp.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"] = BuildSchemaObjectName(cp.ProcedureReference?.Name),
                ["parameters"] = parms,
                ["bodyStart"] = cp.StatementList?.StartOffset,
                ["body"] = stmts,
            });
    }

    private static SqlNode BuildProcedureParameter(ProcedureParameter p) =>
        new SqlNode(
            "ProcedureParameter",
            p.StartOffset,
            p.StartOffset + p.FragmentLength,
            p.VariableName?.Value,
            new Dictionary<string, object?>
            {
                ["name"] = p.VariableName?.Value,
                ["dataType"] = p.DataType?.Name?.BaseIdentifier?.Value,
                ["defaultValue"] = p.Value != null ? BuildScalarExpression(p.Value) : null,
                ["output"] = p.Modifier == ParameterModifier.Output,
                ["readonly"] = p.Modifier == ParameterModifier.ReadOnly,
            });

    // -------------------------------------------------------------------------
    // DDL: CREATE FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateFunctionStatement(CreateFunctionStatement cf)
    {
        var parms = cf.Parameters?.Select(p => (object?)BuildProcedureParameter(p)).ToList();
        string bodyType;
        object? body;

        if (cf.ReturnType is SelectFunctionReturnType selRet)
        {
            bodyType = "table";
            body = BuildQueryExpression(selRet.SelectStatement?.QueryExpression);
        }
        else if (cf.ReturnType is TableValuedFunctionReturnType tvf)
        {
            bodyType = "inline-table";
            body = tvf.DeclareTableVariableBody?.Definition?.ColumnDefinitions
                ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        }
        else
        {
            bodyType = "scalar";
            body = cf.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        }

        return new SqlNode(
            "CreateFunctionStatement",
            cf.StartOffset,
            cf.StartOffset + cf.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"] = BuildSchemaObjectName(cf.Name),
                ["parameters"] = parms,
                ["bodyStart"] = cf.StatementList?.StartOffset,
                ["returnType"] = cf.ReturnType != null ? RawText(cf.ReturnType) : null,
                ["bodyType"] = bodyType,
                ["body"] = body,
            });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER / CREATE OR ALTER VIEW
    // -------------------------------------------------------------------------

    private static SqlNode BuildViewStatement(string type, ViewStatementBody view)
    {
        var rawOptions = view switch
        {
            CreateViewStatement cv         => cv.ViewOptions,
            AlterViewStatement av          => av.ViewOptions,
            CreateOrAlterViewStatement coa => coa.ViewOptions,
            _                              => null,
        };
        var withOptions = rawOptions?.Select(o => (object?)(o.OptionKind switch
        {
            ViewOptionKind.SchemaBinding => "SCHEMABINDING",
            ViewOptionKind.Encryption   => "ENCRYPTION",
            ViewOptionKind.ViewMetadata => "VIEW_METADATA",
            _ => o.OptionKind.ToString(),
        })).ToList();

        var body = view.SelectStatement;
        var queryExpr = body != null ? BuildQueryExpression(body.QueryExpression) : null;

        return new SqlNode(
            type,
            view.StartOffset,
            view.StartOffset + view.FragmentLength,
            null,
            new Dictionary<string, object?>
            {
                ["name"]        = BuildSchemaObjectName(view.SchemaObjectName),
                ["columns"]     = view.Columns?.Select(c => (object?)c.Value).ToList(),
                ["withOptions"] = withOptions,
                ["body"]        = queryExpr,
            });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE OR ALTER PROCEDURE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateOrAlterProcedure(CreateOrAlterProcedureStatement cap)
    {
        var parms = cap.Parameters?.Select(p => (object?)BuildProcedureParameter(p)).ToList();
        var stmts = cap.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("CreateOrAlterProcedureStatement", cap, new Dictionary<string, object?>
        {
            ["name"]       = BuildSchemaObjectName(cap.ProcedureReference?.Name),
            ["parameters"] = parms,
            ["bodyStart"]  = cap.StatementList?.StartOffset,
            ["body"]       = stmts,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: TRUNCATE TABLE
    // -------------------------------------------------------------------------

    private static SqlNode BuildTruncateTable(TruncateTableStatement trunc) =>
        Node("TruncateTableStatement", trunc, new Dictionary<string, object?>
        {
            ["name"] = BuildSchemaObjectName(trunc.TableName),
        });

    // -------------------------------------------------------------------------
    // Control flow: GOTO / LABEL / THROW / RAISERROR / TRY-CATCH
    // -------------------------------------------------------------------------

    private static SqlNode BuildGoto(GoToStatement gt) =>
        Node("GotoStatement", gt, new Dictionary<string, object?>
        {
            ["label"] = gt.LabelName?.Value,
        });

    private static SqlNode BuildLabel(LabelStatement lbl) =>
        Node("LabelStatement", lbl, new Dictionary<string, object?>
        {
            ["label"] = lbl.Value,
        });

    private static SqlNode BuildThrow(ThrowStatement thr) =>
        Node("ThrowStatement", thr, new Dictionary<string, object?>
        {
            ["errorNumber"] = BuildScalarExpression(thr.ErrorNumber),
            ["message"]     = BuildScalarExpression(thr.Message),
            ["state"]       = BuildScalarExpression(thr.State),
        });

    private static SqlNode BuildRaiseError(RaiseErrorStatement raise) =>
        Node("RaiseErrorStatement", raise, new Dictionary<string, object?>
        {
            ["message"]  = BuildScalarExpression(raise.FirstParameter),
            ["severity"] = BuildScalarExpression(raise.SecondParameter),
            ["state"]    = BuildScalarExpression(raise.ThirdParameter),
        });

    private static SqlNode BuildTryCatch(TryCatchStatement tc) =>
        Node("TryCatchStatement", tc, new Dictionary<string, object?>
        {
            ["tryBody"]   = tc.TryStatements?.Statements?.Select(s => (object?)BuildStatement(s)).ToList(),
            ["catchBody"] = tc.CatchStatements?.Statements?.Select(s => (object?)BuildStatement(s)).ToList(),
        });

    // -------------------------------------------------------------------------
    // DDL: DROP TABLE / PROCEDURE / VIEW / FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildDropObjects(string type, DropObjectsStatement drop) =>
        Node(type, drop, new Dictionary<string, object?>
        {
            ["names"]    = drop.Objects?.Select(o => (object?)BuildSchemaObjectName(o)).ToList(),
            ["ifExists"] = drop.IsIfExists,
        });

    // -------------------------------------------------------------------------
    // DDL: DROP INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildDropIndex(DropIndexStatement di) =>
        Node("DropIndexStatement", di, new Dictionary<string, object?>
        {
            ["indices"] = di.DropIndexClauses?.OfType<DropIndexClause>()
                .Select(c => (object?)Node("IndexRef", c, new Dictionary<string, object?>
                {
                    ["name"]  = c.Index?.Value,
                    ["table"] = BuildSchemaObjectName(c.Object),
                })).ToList(),
        });

    // -------------------------------------------------------------------------
    // DML: MERGE
    // -------------------------------------------------------------------------

    private static SqlNode BuildMergeStatement(MergeStatement merge)
    {
        var spec = merge.MergeSpecification;
        var ctes = merge.WithCtesAndXmlNamespaces?.CommonTableExpressions
            ?.Select(c => (object?)BuildCte(c)).ToList();
        return Node("MergeStatement", merge, new Dictionary<string, object?>
        {
            ["ctes"]        = ctes,
            ["target"]      = BuildTableReference(spec?.Target),
            ["targetAlias"] = spec?.TableAlias?.Value,
            ["source"]      = BuildTableReference(spec?.TableReference),
            ["on"]          = BuildBooleanExpression(spec?.SearchCondition),
            ["clauses"]     = spec?.ActionClauses?.Select(c => (object?)BuildMergeActionClause(c)).ToList(),
            ["output"]      = BuildOutputClause(spec?.OutputClause),
            ["outputInto"]  = BuildOutputIntoClause(spec?.OutputIntoClause),
        });
    }

    private static SqlNode BuildMergeActionClause(MergeActionClause clause) =>
        Node("MergeActionClause", clause, new Dictionary<string, object?>
        {
            ["condition"] = clause.Condition.ToString(),
            ["predicate"] = BuildBooleanExpression(clause.SearchCondition),
            ["action"]    = BuildMergeAction(clause.Action),
        });

    private static SqlNode BuildMergeAction(MergeAction action) =>
        action switch
        {
            InsertMergeAction ins => Node("MergeInsertAction", ins, new Dictionary<string, object?>
            {
                ["columns"] = ins.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
                ["source"]  = ins.Source is ValuesInsertSource vals
                              ? BuildValuesInsertSource(vals)
                              : ins.Source != null ? Leaf("InsertSource", ins.Source, RawText(ins.Source)) : null,
            }),
            UpdateMergeAction upd => Node("MergeUpdateAction", upd, new Dictionary<string, object?>
            {
                ["set"] = upd.SetClauses?.Select(s => (object?)BuildSetClause(s)).ToList(),
            }),
            DeleteMergeAction del => Node("MergeDeleteAction", del, new Dictionary<string, object?>()),
            _                     => Leaf("MergeAction", action, RawText(action)),
        };

    private static SqlNode? BuildOutputClause(OutputClause? output)
    {
        if (output == null) return null;
        return Node("OutputClause", output, new Dictionary<string, object?>
        {
            // Use raw text per column: $action, inserted.col, deleted.*, etc. cannot be
            // reliably reconstructed via BuildScalarExpression ($action has a null/zero-length
            // expression fragment in ScriptDom).
            ["columns"] = output.SelectColumns?.Select(c => (object?)Leaf("OutputColumn", c, RawText(c))).ToList(),
        });
    }

    private static SqlNode? BuildOutputIntoClause(OutputIntoClause? output)
    {
        if (output == null) return null;
        return Node("OutputIntoClause", output, new Dictionary<string, object?>
        {
            ["columns"]     = output.SelectColumns?.Select(c => (object?)Leaf("OutputColumn", c, RawText(c))).ToList(),
            ["into"]        = BuildTableReference(output.IntoTable),
            ["intoColumns"] = output.IntoTableColumns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
        });
    }
}
