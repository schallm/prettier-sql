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
        Node("BinaryExpression", bin, new Dictionary<string, object?>
        {
            ["operator"] = bin.BinaryExpressionType.ToString(),
            ["left"] = BuildScalarExpression(bin.FirstExpression),
            ["right"] = BuildScalarExpression(bin.SecondExpression),
        });

    private static SqlNode BuildUnaryExpr(UnaryExpression un) =>
        Node("UnaryExpression", un, new Dictionary<string, object?>
        {
            ["operator"] = un.UnaryExpressionType.ToString(),
            ["expr"] = BuildScalarExpression(un.Expression),
        });

    private static SqlNode BuildParenExpr(ParenthesisExpression paren) =>
        Node("ParenthesisExpression", paren, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(paren.Expression),
        });

    private static SqlNode BuildCaseExpr(CaseExpression caseExpr)
    {
        if (caseExpr is SimpleCaseExpression simple)
        {
            return Node("CaseExpression", simple, new Dictionary<string, object?>
            {
                ["caseType"] = "simple",
                ["input"] = BuildScalarExpression(simple.InputExpression),
                ["whens"] = simple.WhenClauses?.Select(w => (object?)Node("WhenClause", w, new Dictionary<string, object?>
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
            return Node("CaseExpression", searched, new Dictionary<string, object?>
            {
                ["caseType"] = "searched",
                ["whens"] = searched.WhenClauses?.Select(w => (object?)Node("WhenClause", w, new Dictionary<string, object?>
                {
                    ["when"] = BuildBooleanExpression(w.WhenExpression),
                    ["then"] = BuildScalarExpression(w.ThenExpression),
                })).ToList(),
                ["else"] = BuildScalarExpression(searched.ElseExpression),
            });
        }
    }

    private static SqlNode BuildCastCall(CastCall cast) =>
        Node("CastCall", cast, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(cast.Parameter),
            ["dataType"] = cast.DataType != null ? RawText(cast.DataType) : null,
        });

    private static SqlNode BuildConvertCall(ConvertCall conv) =>
        Node("ConvertCall", conv, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(conv.Parameter),
            ["dataType"] = conv.DataType != null ? RawText(conv.DataType) : null,
            ["style"] = BuildScalarExpression(conv.Style),
        });

    private static SqlNode BuildIIfCall(IIfCall iif) =>
        Node("IIfCall", iif, new Dictionary<string, object?>
        {
            ["condition"] = BuildBooleanExpression(iif.Predicate),
            ["trueVal"]   = BuildScalarExpression(iif.ThenExpression),
            ["falseVal"]  = BuildScalarExpression(iif.ElseExpression),
        });

    private static SqlNode BuildCoalesceExpr(CoalesceExpression coalesce) =>
        Node("CoalesceExpression", coalesce, new Dictionary<string, object?>
        {
            ["args"] = coalesce.Expressions?.Select(e => (object?)BuildScalarExpression(e)).ToList(),
        });

    private static SqlNode BuildNullIfExpr(NullIfExpression nullif) =>
        Node("NullIfExpression", nullif, new Dictionary<string, object?>
        {
            ["first"]  = BuildScalarExpression(nullif.FirstExpression),
            ["second"] = BuildScalarExpression(nullif.SecondExpression),
        });

    private static SqlNode BuildTryCastCall(TryCastCall tryCast) =>
        Node("TryCastCall", tryCast, new Dictionary<string, object?>
        {
            ["expr"]     = BuildScalarExpression(tryCast.Parameter),
            ["dataType"] = tryCast.DataType != null ? RawText(tryCast.DataType) : null,
        });

    private static SqlNode BuildTryConvertCall(TryConvertCall tryConv) =>
        Node("TryConvertCall", tryConv, new Dictionary<string, object?>
        {
            ["expr"]     = BuildScalarExpression(tryConv.Parameter),
            ["dataType"] = tryConv.DataType != null ? RawText(tryConv.DataType) : null,
            ["style"]    = BuildScalarExpression(tryConv.Style),
        });

    private static SqlNode BuildAtTimeZoneCall(AtTimeZoneCall atz) =>
        Node("AtTimeZoneCall", atz, new Dictionary<string, object?>
        {
            ["source"]   = BuildScalarExpression(atz.DateValue),
            ["timeZone"] = BuildScalarExpression(atz.TimeZone),
        });

    private static SqlNode BuildScalarSubquery(ScalarSubquery sub) =>
        Node("ScalarSubquery", sub, new Dictionary<string, object?>
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
            FullTextPredicate ftp => BuildFullTextPredicate(ftp),
            _ => Leaf("BooleanExpression", expr, RawText(expr)),
        };
    }

    private static SqlNode BuildBooleanComparison(BooleanComparisonExpression cmp) =>
        Node("BooleanComparison", cmp, new Dictionary<string, object?>
        {
            ["operator"] = cmp.ComparisonType.ToString(),
            ["left"] = BuildScalarExpression(cmp.FirstExpression),
            ["right"] = BuildScalarExpression(cmp.SecondExpression),
        });

    private static SqlNode BuildBooleanBinary(BooleanBinaryExpression bin) =>
        Node("BooleanBinary", bin, new Dictionary<string, object?>
        {
            ["operator"] = bin.BinaryExpressionType.ToString(),
            ["left"] = BuildBooleanExpression(bin.FirstExpression),
            ["right"] = BuildBooleanExpression(bin.SecondExpression),
        });

    private static SqlNode BuildBooleanNot(BooleanNotExpression not) =>
        Node("BooleanNot", not, new Dictionary<string, object?>
        {
            ["expr"] = BuildBooleanExpression(not.Expression),
        });

    private static SqlNode BuildBooleanParen(BooleanParenthesisExpression paren) =>
        Node("BooleanParenthesis", paren, new Dictionary<string, object?>
        {
            ["expr"] = BuildBooleanExpression(paren.Expression),
        });

    private static SqlNode BuildBooleanIsNull(BooleanIsNullExpression isNull) =>
        Node("IsNullExpression", isNull, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(isNull.Expression),
            ["isNot"] = isNull.IsNot,
        });

    private static SqlNode BuildInPredicate(InPredicate inPred) =>
        Node("InPredicate", inPred, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(inPred.Expression),
            ["negated"] = inPred.NotDefined,
            ["values"] = inPred.Values?.Select(v => (object?)BuildScalarExpression(v)).ToList(),
            ["subquery"] = inPred.Subquery != null ? BuildQueryExpression(inPred.Subquery.QueryExpression) : null,
        });

    private static SqlNode BuildLikePredicate(LikePredicate like) =>
        Node("LikePredicate", like, new Dictionary<string, object?>
        {
            ["expr"] = BuildScalarExpression(like.FirstExpression),
            ["pattern"] = BuildScalarExpression(like.SecondExpression),
            ["negated"] = like.NotDefined,
            ["escape"] = BuildScalarExpression(like.EscapeExpression),
        });

    private static SqlNode BuildExistsPredicate(ExistsPredicate exists) =>
        Node("ExistsPredicate", exists, new Dictionary<string, object?>
        {
            ["subquery"] = BuildQueryExpression(exists.Subquery?.QueryExpression),
        });

    private static SqlNode BuildBetween(BooleanTernaryExpression between) =>
        Node("BetweenExpression", between, new Dictionary<string, object?>
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
            FullTextTableReference ftt => BuildFullTextTableReference(ftt),
            OpenXmlTableReference openXml => BuildOpenXmlTableReference(openXml),
            OpenJsonTableReference openJson => BuildOpenJsonTableReference(openJson),
            OpenRowsetTableReference or => BuildOpenRowsetTableReference(or),
            BulkOpenRowset bulkOr => BuildBulkOpenRowset(bulkOr),
            _ => Leaf("TableReference", tableRef, RawText(tableRef)),
        };
    }

    private static SqlNode BuildNamedTableRef(NamedTableReference named)
    {
        var hints = named.TableHints?.Count > 0
            ? named.TableHints.Select(h => (object?)h.HintKind.ToString().ToUpper()).ToList()
            : null;
        return Node("NamedTableReference", named, new Dictionary<string, object?>
        {
            ["name"] = BuildSchemaObjectName(named.SchemaObject),
            ["alias"] = named.Alias?.Value,
            ["hints"] = hints,
        });
    }

    private static SqlNode BuildQualifiedJoin(QualifiedJoin qj) =>
        Node("QualifiedJoin", qj, new Dictionary<string, object?>
        {
            ["joinType"] = qj.QualifiedJoinType.ToString(),
            ["left"] = BuildTableReference(qj.FirstTableReference),
            ["right"] = BuildTableReference(qj.SecondTableReference),
            ["condition"] = BuildBooleanExpression(qj.SearchCondition),
        });

    private static SqlNode BuildUnqualifiedJoin(UnqualifiedJoin uj) =>
        Node("UnqualifiedJoin", uj, new Dictionary<string, object?>
        {
            ["joinType"] = uj.UnqualifiedJoinType.ToString(),
            ["left"] = BuildTableReference(uj.FirstTableReference),
            ["right"] = BuildTableReference(uj.SecondTableReference),
        });

    private static SqlNode BuildJoinParenthesis(JoinParenthesisTableReference jp) =>
        Node("JoinParenthesisTableReference", jp, new Dictionary<string, object?>
        {
            ["join"] = BuildTableReference(jp.Join),
        });

    private static SqlNode BuildQueryDerivedTable(QueryDerivedTable sub) =>
        Node("QueryDerivedTable", sub, new Dictionary<string, object?>
        {
            ["query"] = BuildQueryExpression(sub.QueryExpression),
            ["alias"] = sub.Alias?.Value,
        });

    private static SqlNode BuildSchemaObjectFunctionTableRef(SchemaObjectFunctionTableReference tvf)
    {
        var args = tvf.Parameters?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        return Node("SchemaObjectFunctionTableReference", tvf, new Dictionary<string, object?>
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

        return Node("QuerySpecification", qs, new Dictionary<string, object?>
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
        Node("TopRowFilter", top, new Dictionary<string, object?>
        {
            ["expression"] = BuildScalarExpression(top.Expression),
            ["percent"] = top.Percent,
            ["withTies"] = top.WithTies,
        });

    private static SqlNode? BuildSelectElement(SelectElement se) => se switch
    {
        SelectStarExpression star      => Leaf("SelectStar", star, RawText(star)),
        SelectScalarExpression scalar  => Node("SelectScalar", scalar, new Dictionary<string, object?>
        {
            ["expression"] = BuildScalarExpression(scalar.Expression),
            ["alias"]      = scalar.ColumnName?.Value,
        }),
        SelectSetVariable sv           => Node("SelectSetVariable", sv, new Dictionary<string, object?>
        {
            ["variable"] = sv.Variable?.Name,
            ["operator"] = sv.AssignmentKind.ToString(),
            ["value"]    = BuildScalarExpression(sv.Expression),
        }),
        _                              => Leaf("SelectElement", se, RawText(se)),
    };

    private static SqlNode BuildFromClause(FromClause fc)
    {
        var tableRefs = fc.TableReferences?.Select(tr => (object?)BuildTableReference(tr)).ToList();
        return Node("FromClause", fc, new Dictionary<string, object?>
        {
            ["tableReferences"] = tableRefs,
        });
    }

    private static SqlNode BuildGroupByClause(GroupByClause gb)
    {
        var elements = gb.GroupingSpecifications?.Select(gs => (object?)BuildGroupingSpec(gs)).ToList();
        return Node("GroupByClause", gb, new Dictionary<string, object?>
        {
            ["elements"] = elements,
        });
    }

    private static SqlNode? BuildGroupingSpec(GroupingSpecification gs) => gs switch
    {
        ExpressionGroupingSpecification expr     => BuildScalarExpression(expr.Expression),
        RollupGroupingSpecification rollup       => Node("RollupSpec", rollup, new Dictionary<string, object?>
            { ["expressions"] = rollup.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        CubeGroupingSpecification cube           => Node("CubeSpec", cube, new Dictionary<string, object?>
            { ["expressions"] = cube.Arguments?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        GroupingSetsGroupingSpecification gsets  => Node("GroupingSetsSpec", gsets, new Dictionary<string, object?>
            { ["sets"] = gsets.Sets?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        CompositeGroupingSpecification composite => Node("CompositeGroupingSpec", composite, new Dictionary<string, object?>
            { ["items"] = composite.Items?.Select(e => (object?)BuildGroupingSpec(e)).ToList() }),
        GrandTotalGroupingSpecification          => Leaf("GrandTotalSpec", gs, "()"),
        _                                        => Leaf("GroupingSpecification", gs, RawText(gs)),
    };

    private static SqlNode BuildOrderByClause(OrderByClause ob)
    {
        var elements = ob.OrderByElements?.Select(e => (object?)BuildOrderByElement(e)).ToList();
        return Node("OrderByClause", ob, new Dictionary<string, object?>
        {
            ["elements"] = elements,
        });
    }

    private static SqlNode BuildOrderByElement(ExpressionWithSortOrder e) =>
        Node("OrderByElement", e, new Dictionary<string, object?>
        {
            ["expression"] = BuildScalarExpression(e.Expression),
            ["sortOrder"] = e.SortOrder.ToString(),
        });

    private static SqlNode BuildBinaryQuery(BinaryQueryExpression bq) =>
        Node("BinaryQueryExpression", bq, new Dictionary<string, object?>
        {
            ["operator"] = bq.BinaryQueryExpressionType.ToString(),
            ["all"] = bq.All,
            ["left"] = BuildQueryExpression(bq.FirstQueryExpression),
            ["right"] = BuildQueryExpression(bq.SecondQueryExpression),
        });

    private static SqlNode BuildQueryParen(QueryParenthesisExpression qp) =>
        Node("QueryParenthesis", qp, new Dictionary<string, object?>
        {
            ["query"] = BuildQueryExpression(qp.QueryExpression),
        });

    private static SqlNode BuildOverClause(OverClause over)
    {
        var partitionBy = over.Partitions?.Select(p => (object?)BuildScalarExpression(p)).ToList();
        var orderBy = over.OrderByClause != null ? BuildOrderByClause(over.OrderByClause) : null;
        return Node("OverClause", over, new Dictionary<string, object?>
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
        Root = Node("TSqlScript", script, new Dictionary<string, object?>
        {
            ["batches"] = batches,
        });
    }

    private static SqlNode BuildBatch(TSqlBatch batch)
    {
        var stmts = batch.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("TSqlBatch", batch, new Dictionary<string, object?>
        {
            ["statements"] = stmts,
        });
    }

    private static SqlNode? BuildStatement(TSqlStatement stmt)
    {
        if (stmt == null) return null;
        return stmt switch
        {
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

            // DDL — types & bulk insert
            BulkInsertStatement bulk => BuildBulkInsert(bulk),
            CreateTypeUddtStatement ctud => BuildCreateTypeUddt(ctud),
            CreateTypeTableStatement cttbl => BuildCreateTypeTable(cttbl),

            // DDL — DROP (shared helper)
            DropTableStatement dts => BuildDropObjects("DropTableStatement", dts),
            DropProcedureStatement dps => BuildDropObjects("DropProcedureStatement", dps),
            DropViewStatement dvs => BuildDropObjects("DropViewStatement", dvs),
            DropFunctionStatement dfs => BuildDropObjects("DropFunctionStatement", dfs),

            // BEGIN/END block
            BeginEndBlockStatement begin => BuildBeginEnd(begin),

            // Transactions
            BeginTransactionStatement bt => BuildBeginTransaction(bt),
            CommitTransactionStatement ct => BuildCommitTransaction(ct),
            RollbackTransactionStatement rt => BuildRollbackTransaction(rt),

            // Variable management
            DeclareVariableStatement dv => BuildDeclareVariable(dv),
            DeclareTableVariableStatement dtv => BuildDeclareTableVariable(dtv),
            SetVariableStatement sv => BuildSetVariable(sv),
            SetRowCountStatement src => BuildSetRowCount(src),

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
            CreateRoleStatement crol => BuildCreateRole(crol),
            AlterRoleStatement arol => BuildAlterRole(arol),
            DropRoleStatement drol => BuildDropRole(drol),

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

        return Node("SelectStatement", sel, new Dictionary<string, object?>
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

        return Node("InsertStatement", ins, new Dictionary<string, object?>
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
            return (object?)Node("ValuesRow", rv, new Dictionary<string, object?> { ["values"] = values });
        }).ToList();

        return Node("ValuesSource", vals, new Dictionary<string, object?> { ["rows"] = rows });
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

        return Node("UpdateStatement", upd, new Dictionary<string, object?>
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

    private static SqlNode BuildSetClause(SetClause sc) => sc switch
    {
        AssignmentSetClause asc => Node("AssignmentSetClause", asc, new Dictionary<string, object?>
        {
            ["column"]   = BuildColumnRef(asc.Column),
            ["operator"] = asc.AssignmentKind.ToString(),
            ["value"]    = BuildScalarExpression(asc.NewValue),
        }),
        _ => Leaf("SetClause", sc, RawText(sc)),
    };

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

        return Node("DeleteStatement", del, new Dictionary<string, object?>
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
        Node("BeginTransactionStatement", bt, new Dictionary<string, object?> { ["name"] = bt.Name?.Identifier?.Value });

    private static SqlNode BuildCommitTransaction(CommitTransactionStatement ct) =>
        Node("CommitTransactionStatement", ct, new Dictionary<string, object?> { ["name"] = ct.Name?.Identifier?.Value });

    private static SqlNode BuildRollbackTransaction(RollbackTransactionStatement rt) =>
        Node("RollbackTransactionStatement", rt, new Dictionary<string, object?> { ["name"] = rt.Name?.Identifier?.Value });

    private static SqlNode BuildDeclareVariable(DeclareVariableStatement dv)
    {
        var decls = dv.Declarations?.Select(d => (object?)BuildDeclareElement(d)).ToList();
        return Node("DeclareVariableStatement", dv, new Dictionary<string, object?> { ["declarations"] = decls });
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
        return Node("DeclareTableVariableStatement", dtv, new Dictionary<string, object?>
        {
            ["name"] = body?.VariableName?.Value,
            ["columns"] = columns,
            ["constraints"] = constraints,
        });
    }

    private static SqlNode BuildSetVariable(SetVariableStatement sv) =>
        Node("SetVariableStatement", sv, new Dictionary<string, object?>
        {
            ["name"]     = sv.Variable?.Name,
            ["value"]    = BuildScalarExpression(sv.Expression),
            ["operator"] = sv.AssignmentKind.ToString(),
        });

    private static SqlNode BuildSetRowCount(SetRowCountStatement src) =>
        Node("SetRowCountStatement", src, new Dictionary<string, object?> { ["rows"] = BuildScalarExpression(src.NumberRows) });

    private static SqlNode BuildPrint(PrintStatement ps) =>
        Node("PrintStatement", ps, new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(ps.Expression) });

    private static SqlNode BuildReturn(ReturnStatement rs) =>
        Node("ReturnStatement", rs, new Dictionary<string, object?> { ["expr"] = BuildScalarExpression(rs.Expression) });

    private static SqlNode BuildIf(IfStatement ifs) =>
        Node("IfStatement", ifs, new Dictionary<string, object?>
        {
            ["condition"] = BuildBooleanExpression(ifs.Predicate),
            ["then"]      = BuildStatement(ifs.ThenStatement),
            ["else"]      = ifs.ElseStatement != null ? BuildStatement(ifs.ElseStatement) : null,
        });

    private static SqlNode BuildWhile(WhileStatement ws) =>
        Node("WhileStatement", ws, new Dictionary<string, object?>
        {
            ["condition"] = BuildBooleanExpression(ws.Predicate),
            ["body"]      = BuildStatement(ws.Statement),
        });

    private static SqlNode BuildExecute(ExecuteStatement es)
    {
        var spec = es.ExecuteSpecification;
        var execProc = spec?.ExecutableEntity as ExecutableProcedureReference;
        var procNode = execProc != null
            ? BuildSchemaObjectName(execProc.ProcedureReference?.ProcedureReference?.Name)
            : null;

        var procParams = execProc?.Parameters;
        var parameters = procParams?.Select(p => (object?)Node("ExecuteParameter", p, new Dictionary<string, object?>
        {
            ["name"]   = p.Variable?.Name,
            ["value"]  = BuildScalarExpression(p.ParameterValue),
            ["output"] = p.IsOutput,
        })).ToList();

        return Node("ExecuteStatement", es, new Dictionary<string, object?>
        {
            ["proc"]       = procNode,
            ["parameters"] = parameters,
        });
    }

    private static SqlNode BuildBeginEnd(BeginEndBlockStatement begin)
    {
        var stmts = begin.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node("BeginEndBlock", begin, new Dictionary<string, object?>
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

        return Node("CreateTableStatement", ct, new Dictionary<string, object?>
        {
            ["name"]        = BuildSchemaObjectName(ct.SchemaObjectName),
            ["columns"]     = columns,
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

        return Node("AlterTableStatement", at, props);
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
            ci.StartOffset, ci.StartOffset + ci.FragmentLength,
            ci.Name?.Value,
            new Dictionary<string, object?>
            {
                ["indexName"]      = ci.Name?.Value,
                ["unique"]         = ci.Unique,
                ["clustered"]      = ci.Clustered,
                ["table"]          = BuildSchemaObjectName(ci.OnName),
                ["columns"]        = cols,
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

        return Node("CreateProcedureStatement", cp, new Dictionary<string, object?>
        {
            ["name"]       = BuildSchemaObjectName(cp.ProcedureReference?.Name),
            ["parameters"] = parms,
            ["bodyStart"]  = cp.StatementList?.StartOffset,
            ["body"]       = stmts,
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
                ["dataType"] = p.DataType != null ? RawText(p.DataType) : null,
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

        return Node("CreateFunctionStatement", cf, new Dictionary<string, object?>
        {
            ["name"]       = BuildSchemaObjectName(cf.Name),
            ["parameters"] = parms,
            ["bodyStart"]  = cf.StatementList?.StartOffset,
            ["returnType"] = cf.ReturnType != null ? RawText(cf.ReturnType) : null,
            ["bodyType"]   = bodyType,
            ["body"]       = body,
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

        return Node(type, view, new Dictionary<string, object?>
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

    // -------------------------------------------------------------------------
    // Full-text predicates: CONTAINS / FREETEXT
    // -------------------------------------------------------------------------

    private static SqlNode BuildFullTextPredicate(FullTextPredicate ftp) =>
        Node("FullTextPredicate", ftp, new Dictionary<string, object?>
        {
            ["functionType"] = ftp.FullTextFunctionType.ToString(),
            ["columns"]      = ftp.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
            ["value"]        = BuildScalarExpression(ftp.Value),
            ["language"]     = ftp.LanguageTerm != null ? RawText(ftp.LanguageTerm) : null,
        });

    private static SqlNode BuildFullTextTableReference(FullTextTableReference ftt) =>
        Node("FullTextTableReference", ftt, new Dictionary<string, object?>
        {
            ["functionType"]    = ftt.FullTextFunctionType.ToString(),
            ["tableName"]       = BuildSchemaObjectName(ftt.TableName),
            ["columns"]         = ftt.Columns?.Select(c => (object?)BuildColumnRef(c)).ToList(),
            ["searchCondition"] = BuildScalarExpression(ftt.SearchCondition),
            ["topN"]            = BuildScalarExpression(ftt.TopN),
            ["language"]        = ftt.Language != null ? RawText(ftt.Language) : null,
            ["alias"]           = ftt.Alias?.Value,
        });

    // -------------------------------------------------------------------------
    // USE / SET ON-OFF / WAITFOR / ALTER PROCEDURE / ALTER FUNCTION
    // -------------------------------------------------------------------------

    private static SqlNode BuildUseStatement(UseStatement use) =>
        Node("UseStatement", use, new Dictionary<string, object?>
        {
            ["database"] = use.DatabaseName?.Value,
        });

    private static SqlNode BuildPredicateSetStatement(PredicateSetStatement ps) =>
        Node("PredicateSetStatement", ps, new Dictionary<string, object?>
        {
            ["options"] = SetOptionsToSql(ps.Options),
            ["isOn"]    = ps.IsOn,
        });

    private static SqlNode BuildSetStatisticsStatement(SetStatisticsStatement sst) =>
        Node("SetStatisticsStatement", sst, new Dictionary<string, object?>
        {
            ["options"] = sst.Options.ToString().ToUpper(),
            ["isOn"]    = sst.IsOn,
        });

    private static SqlNode BuildSetIdentityInsert(SetIdentityInsertStatement sis) =>
        Node("SetIdentityInsertStatement", sis, new Dictionary<string, object?>
        {
            ["table"] = BuildSchemaObjectName(sis.Table),
            ["isOn"]  = sis.IsOn,
        });

    private static SqlNode BuildSetIsolationLevel(SetTransactionIsolationLevelStatement s) =>
        Node("SetTransactionIsolationLevelStatement", s, new Dictionary<string, object?>
        {
            ["level"] = s.Level.ToString(),
        });

    private static SqlNode BuildWaitFor(WaitForStatement wf) =>
        Node("WaitForStatement", wf, new Dictionary<string, object?>
        {
            ["option"]    = wf.WaitForOption.ToString(),
            ["parameter"] = wf.Parameter != null ? RawText(wf.Parameter) : null,
        });

    private static string SetOptionsToSql(SetOptions opt) => opt switch
    {
        SetOptions.NoCount              => "NOCOUNT",
        SetOptions.QuotedIdentifier     => "QUOTED_IDENTIFIER",
        SetOptions.AnsiNulls            => "ANSI_NULLS",
        SetOptions.AnsiWarnings         => "ANSI_WARNINGS",
        SetOptions.AnsiPadding          => "ANSI_PADDING",
        SetOptions.AnsiDefaults         => "ANSI_DEFAULTS",
        SetOptions.AnsiNullDfltOn       => "ANSI_NULL_DFLT_ON",
        SetOptions.AnsiNullDfltOff      => "ANSI_NULL_DFLT_OFF",
        SetOptions.XactAbort            => "XACT_ABORT",
        SetOptions.ConcatNullYieldsNull => "CONCAT_NULL_YIELDS_NULL",
        SetOptions.ArithAbort           => "ARITHABORT",
        SetOptions.ArithIgnore          => "ARITHIGNORE",
        SetOptions.ImplicitTransactions => "IMPLICIT_TRANSACTIONS",
        SetOptions.RemoteProcTransactions => "REMOTE_PROC_TRANSACTIONS",
        SetOptions.CursorCloseOnCommit  => "CURSOR_CLOSE_ON_COMMIT",
        SetOptions.FmtOnly              => "FMTONLY",
        SetOptions.NoExec               => "NOEXEC",
        SetOptions.NumericRoundAbort    => "NUMERIC_ROUNDABORT",
        SetOptions.ParseOnly            => "PARSEONLY",
        SetOptions.ForcePlan            => "FORCEPLAN",
        SetOptions.ShowPlanAll          => "SHOWPLAN_ALL",
        SetOptions.ShowPlanText         => "SHOWPLAN_TEXT",
        SetOptions.ShowPlanXml          => "SHOWPLAN_XML",
        SetOptions.NoBrowsetable        => "NO_BROWSETABLE",
        SetOptions.DisableDefCnstChk    => "DISABLE_DEF_CNST_CHK",
        _                               => opt.ToString().ToUpper(),
    };

    private static SqlNode BuildProcedureStatement(string type, ProcedureStatementBody p)
    {
        var parms = p.Parameters?.Select(pr => (object?)BuildProcedureParameter(pr)).ToList();
        var stmts = p.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node(type, p, new Dictionary<string, object?>
        {
            ["name"]      = BuildSchemaObjectName(p.ProcedureReference?.Name),
            ["parameters"] = parms,
            ["bodyStart"] = p.StatementList?.StartOffset,
            ["body"]      = stmts,
        });
    }

    private static SqlNode BuildFunctionStatement(string type, FunctionStatementBody f)
    {
        var parms = f.Parameters?.Select(p => (object?)BuildProcedureParameter(p)).ToList();
        string bodyType;
        object? body;

        if (f.ReturnType is SelectFunctionReturnType selRet)
        {
            bodyType = "table";
            body = BuildQueryExpression(selRet.SelectStatement?.QueryExpression);
        }
        else if (f.ReturnType is TableValuedFunctionReturnType tvf)
        {
            bodyType = "inline-table";
            body = tvf.DeclareTableVariableBody?.Definition?.ColumnDefinitions
                ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        }
        else
        {
            bodyType = "scalar";
            body = f.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        }

        return Node(type, f, new Dictionary<string, object?>
        {
            ["name"]       = BuildSchemaObjectName(f.Name),
            ["parameters"] = parms,
            ["bodyStart"]  = f.StatementList?.StartOffset,
            ["returnType"] = f.ReturnType != null ? RawText(f.ReturnType) : null,
            ["bodyType"]   = bodyType,
            ["body"]       = body,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER TRIGGER
    // -------------------------------------------------------------------------

    private static SqlNode BuildTriggerStatement(string type, TriggerStatementBody trigger)
    {
        var actions = trigger.TriggerActions?.Select(a => (object?)a.TriggerActionType.ToString()).ToList();
        var stmts = trigger.StatementList?.Statements?.Select(s => (object?)BuildStatement(s)).ToList();
        return Node(type, trigger, new Dictionary<string, object?>
        {
            ["name"]        = BuildSchemaObjectName(trigger.Name),
            ["onName"]      = BuildSchemaObjectName(trigger.TriggerObject?.Name),
            ["triggerType"] = trigger.TriggerType.ToString(),
            ["actions"]     = actions,
            ["body"]        = stmts,
        });
    }

    // -------------------------------------------------------------------------
    // DDL: ALTER INDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildAlterIndex(AlterIndexStatement ai) =>
        Node("AlterIndexStatement", ai, new Dictionary<string, object?>
        {
            ["indexName"] = ai.Name?.Value,   // null means ALL
            ["table"]     = BuildSchemaObjectName(ai.OnName),
            ["alterType"] = ai.AlterIndexType.ToString(),
        });

    // -------------------------------------------------------------------------
    // Cursor operations
    // -------------------------------------------------------------------------

    private static SqlNode BuildDeclareCursor(DeclareCursorStatement dc)
    {
        var opts = dc.CursorDefinition?.Options
            ?.Select(o => (object?)o.OptionKind.ToString().ToUpper()).ToList();
        var select = dc.CursorDefinition?.Select != null
            ? BuildQueryExpression(dc.CursorDefinition.Select.QueryExpression)
            : null;
        return Node("DeclareCursorStatement", dc, new Dictionary<string, object?>
        {
            ["name"]    = dc.Name?.Value,
            ["options"] = opts,
            ["select"]  = select,
        });
    }

    private static SqlNode BuildOpenCursor(OpenCursorStatement oc) =>
        Node("OpenCursorStatement", oc, new Dictionary<string, object?>
        {
            ["cursorName"] = oc.Cursor?.Name?.Value,
        });

    private static SqlNode BuildFetchCursor(FetchCursorStatement fc)
    {
        var intoVars = fc.IntoVariables?.Select(v => (object?)v.Name).ToList();
        return Node("FetchCursorStatement", fc, new Dictionary<string, object?>
        {
            ["fetchType"]     = fc.FetchType?.Orientation.ToString(),
            ["cursorName"]    = fc.Cursor?.Name?.Value,
            ["intoVariables"] = intoVars,
            ["fetchOffset"]   = BuildScalarExpression(fc.FetchType?.RowOffset),
        });
    }

    private static SqlNode BuildCloseCursor(CloseCursorStatement cc) =>
        Node("CloseCursorStatement", cc, new Dictionary<string, object?>
        {
            ["cursorName"] = cc.Cursor?.Name?.Value,
        });

    private static SqlNode BuildDeallocateCursor(DeallocateCursorStatement dalc) =>
        Node("DeallocateCursorStatement", dalc, new Dictionary<string, object?>
        {
            ["cursorName"] = dalc.Cursor?.Name?.Value,
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE / ALTER / DROP SEQUENCE
    // -------------------------------------------------------------------------

    private static Dictionary<string, object?> ExtractSequenceOptions(IList<SequenceOption>? options)
    {
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
        string? cache = null;

        foreach (var opt in options ?? [])
        {
            if (opt is DataTypeSequenceOption dtOpt)
            {
                dataType = dtOpt.DataType != null ? RawText(dtOpt.DataType) : null;
            }
            else if (opt is ScalarExpressionSequenceOption seOpt && seOpt.OptionValue != null)
            {
                var val = RawText(seOpt.OptionValue);
                switch (seOpt.OptionKind)
                {
                    case SequenceOptionKind.Start:     startWith = val; break;
                    case SequenceOptionKind.Restart:   restartWith = val; break;
                    case SequenceOptionKind.Increment: incrementBy = val; break;
                    case SequenceOptionKind.MinValue:  minValue = val; break;
                    case SequenceOptionKind.MaxValue:  maxValue = val; break;
                    case SequenceOptionKind.Cache:     cache = val; break;
                }
            }
            else
            {
                // NoValue=true means it's a NO xxx option (NO CYCLE, NO MINVALUE, etc.)
                switch (opt.OptionKind)
                {
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
                        break;
                }
            }
        }

        return new Dictionary<string, object?>
        {
            ["dataType"]    = dataType,
            ["startWith"]   = startWith,
            ["restartWith"] = restartWith,
            ["incrementBy"] = incrementBy,
            ["minValue"]    = minValue,
            ["maxValue"]    = maxValue,
            ["noMinValue"]  = noMinValue,
            ["noMaxValue"]  = noMaxValue,
            ["cycle"]       = cycle,
            ["cache"]       = cache,
            ["noCache"]     = noCache,
        };
    }

    private static SqlNode BuildCreateSequence(CreateSequenceStatement cseq)
    {
        var opts = ExtractSequenceOptions(cseq.SequenceOptions);
        opts["name"] = BuildSchemaObjectName(cseq.Name);
        return Node("CreateSequenceStatement", cseq, opts);
    }

    private static SqlNode BuildAlterSequence(AlterSequenceStatement aseq)
    {
        var opts = ExtractSequenceOptions(aseq.SequenceOptions);
        opts["name"] = BuildSchemaObjectName(aseq.Name);
        return Node("AlterSequenceStatement", aseq, opts);
    }

    // -------------------------------------------------------------------------
    // DML: BULK INSERT
    // -------------------------------------------------------------------------

    private static SqlNode BuildBulkInsert(BulkInsertStatement bulk) =>
        Node("BulkInsertStatement", bulk, new Dictionary<string, object?>
        {
            ["table"]   = BuildSchemaObjectName(bulk.To),
            ["from"]    = bulk.From != null ? RawText(bulk.From) : null,
            ["options"] = bulk.Options?.Select(o => (object?)RawText(o)).ToList(),
        });

    // -------------------------------------------------------------------------
    // DDL: CREATE TYPE
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreateTypeUddt(CreateTypeUddtStatement ctud) =>
        Node("CreateTypeUddtStatement", ctud, new Dictionary<string, object?>
        {
            ["name"]     = BuildSchemaObjectName(ctud.Name),
            ["dataType"] = ctud.DataType != null ? RawText(ctud.DataType) : null,
            ["nullable"] = ctud.NullableConstraint?.Nullable,
        });

    private static SqlNode BuildCreateTypeTable(CreateTypeTableStatement cttbl)
    {
        var columns = cttbl.Definition?.ColumnDefinitions
            ?.Select(c => (object?)BuildColumnDefinition(c)).ToList();
        var constraints = cttbl.Definition?.TableConstraints
            ?.Select(c => (object?)BuildTableConstraint(c)).ToList();
        return Node("CreateTypeTableStatement", cttbl, new Dictionary<string, object?>
        {
            ["name"]        = BuildSchemaObjectName(cttbl.Name),
            ["columns"]     = columns,
            ["constraints"] = constraints,
        });
    }

    private static SqlNode BuildSchemaItem(SchemaDeclarationItem item)
    {
        var text = RawText(item);
        // SchemaDeclarationItemOpenjson.AsJson is outside the fragment span — append manually
        if (item is SchemaDeclarationItemOpenjson ojItem && ojItem.AsJson)
            text += " as json";
        return Leaf("SchemaItem", item, text);
    }

    private static SqlNode BuildOpenXmlTableReference(OpenXmlTableReference ox) =>
        Node("OpenXmlTableReference", ox, new Dictionary<string, object?>
        {
            ["variable"]   = ox.Variable   != null ? RawText(ox.Variable)   : null,
            ["rowPattern"] = ox.RowPattern  != null ? RawText(ox.RowPattern) : null,
            ["flags"]      = ox.Flags       != null ? RawText(ox.Flags)      : null,
            ["withItems"]  = ox.SchemaDeclarationItems?.Count > 0
                             ? ox.SchemaDeclarationItems.Select(i => (object?)BuildSchemaItem(i)).ToList()
                             : null,
            ["tableName"]  = ox.TableName != null ? BuildSchemaObjectName(ox.TableName) : null,
            ["alias"]      = ox.Alias?.Value,
        });

    private static SqlNode BuildOpenJsonTableReference(OpenJsonTableReference oj) =>
        Node("OpenJsonTableReference", oj, new Dictionary<string, object?>
        {
            ["variable"]   = oj.Variable   != null ? RawText(oj.Variable)   : null,
            ["rowPattern"] = oj.RowPattern  != null ? RawText(oj.RowPattern) : null,
            ["withItems"]  = oj.SchemaDeclarationItems?.Count > 0
                             ? oj.SchemaDeclarationItems.Select(i => (object?)BuildSchemaItem(i)).ToList()
                             : null,
            ["alias"]      = oj.Alias?.Value,
        });

    // -------------------------------------------------------------------------
    // Rowset functions: OPENROWSET (provider form) and OPENROWSET(BULK ...)
    // -------------------------------------------------------------------------

    private static SqlNode BuildOpenRowsetTableReference(OpenRowsetTableReference or) =>
        Node("OpenRowsetTableReference", or, new Dictionary<string, object?>
        {
            ["providerName"]   = or.ProviderName   != null ? RawText(or.ProviderName)   : null,
            // Connection: either a single provider string or three-part datasource;userid;password
            ["providerString"] = or.ProviderString != null ? RawText(or.ProviderString) : null,
            ["dataSource"]     = or.DataSource     != null ? RawText(or.DataSource)     : null,
            ["userId"]         = or.UserId         != null ? RawText(or.UserId)         : null,
            ["password"]       = or.Password       != null ? RawText(or.Password)       : null,
            // Third argument: either an ad-hoc query string or a remote schema object name
            ["query"]          = or.Query          != null ? RawText(or.Query)          : null,
            ["object"]         = or.Object         != null ? BuildSchemaObjectName(or.Object) : null,
            ["alias"]          = or.Alias?.Value,
        });

    private static SqlNode BuildBulkOpenRowset(BulkOpenRowset bulk) =>
        Node("BulkOpenRowset", bulk, new Dictionary<string, object?>
        {
            ["dataFiles"] = bulk.DataFiles?.Count > 0
                            ? bulk.DataFiles.Select(f => (object?)RawText(f)).ToList()
                            : null,
            ["options"]   = bulk.Options?.Count > 0
                            ? bulk.Options.Select(o => (object?)RawText(o)).ToList()
                            : null,
            ["alias"]     = bulk.Alias?.Value,
        });

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

    // -------------------------------------------------------------------------
    // Security: GRANT / DENY / REVOKE
    // -------------------------------------------------------------------------

    private static Dictionary<string, object?> BuildSecurityBase(SecurityStatement s) => new()
    {
        ["permissions"] = s.Permissions?.Select(p => (object?)BuildPermission(p)).ToList(),
        ["target"]      = BuildSecurityTarget(s.SecurityTargetObject),
        ["principals"]  = s.Principals?.Select(p => (object?)BuildSecurityPrincipal(p)).ToList(),
        ["asClause"]    = s.AsClause != null ? RawText(s.AsClause) : null,
    };

    private static SqlNode BuildGrant(GrantStatement s)
    {
        var props = BuildSecurityBase(s);
        props["withGrantOption"] = s.WithGrantOption;
        return Node("GrantStatement", s, props);
    }

    private static SqlNode BuildDeny(DenyStatement s)
    {
        var props = BuildSecurityBase(s);
        props["cascade"] = s.CascadeOption;
        return Node("DenyStatement", s, props);
    }

    private static SqlNode BuildRevoke(RevokeStatement s)
    {
        var props = BuildSecurityBase(s);
        props["grantOptionFor"] = s.GrantOptionFor;
        props["cascade"]        = s.CascadeOption;
        return Node("RevokeStatement", s, props);
    }

    private static object? BuildPermission(Permission p)
    {
        // Join identifier Values to form the permission keyword (e.g. "ALTER ANY USER")
        var name = string.Join(" ", p.Identifiers?.Select(id => id.Value ?? "") ?? []);
        var cols = p.Columns?.Count > 0
            ? p.Columns.Select(c => RawText(c)).ToList<object?>()
            : null;
        return new Dictionary<string, object?> { ["name"] = name, ["columns"] = cols };
    }

    private static object? BuildSecurityTarget(SecurityTargetObject? target)
    {
        if (target == null) return null;
        return new Dictionary<string, object?>
        {
            ["objectKind"] = target.ObjectKind.ToString(),
            ["objectName"] = target.ObjectName != null ? RawText(target.ObjectName) : null,
            ["columns"]    = target.Columns?.Count > 0
                             ? target.Columns.Select(c => RawText(c)).ToList<object?>()
                             : null,
        };
    }

    private static object? BuildSecurityPrincipal(SecurityPrincipal p) => new Dictionary<string, object?>
    {
        ["principalType"] = p.PrincipalType.ToString(),
        ["name"]          = p.Identifier != null ? RawText(p.Identifier) : null,
    };

    // -------------------------------------------------------------------------
    // Security: USER / LOGIN / ROLE
    // -------------------------------------------------------------------------

    private static object? BuildPrincipalOption(PrincipalOption opt) => opt switch
    {
        PasswordAlterPrincipalOption popt => new Dictionary<string, object?>
        {
            ["kind"]        = "Password",
            ["password"]    = popt.Password    != null ? RawText(popt.Password)    : null,
            ["oldPassword"] = popt.OldPassword != null ? RawText(popt.OldPassword) : null,
            ["mustChange"]  = popt.MustChange,
            ["unlock"]      = popt.Unlock,
            ["hashed"]      = popt.Hashed,
        },
        OnOffPrincipalOption onOff => new Dictionary<string, object?>
        {
            ["kind"]  = opt.OptionKind.ToString(),
            ["onOff"] = onOff.OptionState == OptionState.On ? "on" : "off",
        },
        LiteralPrincipalOption litOpt => new Dictionary<string, object?>
        {
            ["kind"]  = opt.OptionKind.ToString(),
            ["value"] = litOpt.Value != null ? RawText(litOpt.Value) : null,
        },
        IdentifierPrincipalOption idOpt => new Dictionary<string, object?>
        {
            ["kind"]       = opt.OptionKind.ToString(),
            ["identifier"] = idOpt.Identifier?.Value,
        },
        _ => new Dictionary<string, object?> { ["kind"] = opt.OptionKind.ToString() },
    };

    private static List<object?>? BuildPrincipalOptions<T>(IList<T>? options) where T : class =>
        options?.Count > 0
            ? options.OfType<PrincipalOption>().Select(o => (object?)BuildPrincipalOption(o)).ToList()
            : null;

    // USER

    private static SqlNode BuildCreateUser(CreateUserStatement s) =>
        Node("CreateUserStatement", s, new Dictionary<string, object?>
        {
            ["name"]            = s.Name?.Value,
            ["loginOptionType"] = s.UserLoginOption?.UserLoginOptionType.ToString(),
            ["loginOptionId"]   = s.UserLoginOption?.Identifier?.Value,
            ["options"]         = BuildPrincipalOptions(s.UserOptions),
        });

    private static SqlNode BuildAlterUser(AlterUserStatement s) =>
        Node("AlterUserStatement", s, new Dictionary<string, object?>
        {
            ["name"]    = s.Name?.Value,
            ["options"] = BuildPrincipalOptions(s.UserOptions),
        });

    private static SqlNode BuildDropUser(DropUserStatement s) =>
        Node("DropUserStatement", s, new Dictionary<string, object?>
        {
            ["name"]     = s.Name?.Value,
            ["ifExists"] = s.IsIfExists,
        });

    // LOGIN

    private static SqlNode BuildCreateLogin(CreateLoginStatement s)
    {
        var props = new Dictionary<string, object?> { ["name"] = s.Name?.Value };
        switch (s.Source)
        {
            case PasswordCreateLoginSource pcs:
                props["sourceType"] = "Password";
                props["password"]   = pcs.Password != null ? RawText(pcs.Password) : null;
                props["hashed"]     = pcs.Hashed;
                props["mustChange"] = pcs.MustChange;
                props["options"]    = BuildPrincipalOptions(pcs.Options);
                break;
            case WindowsCreateLoginSource wcs:
                props["sourceType"] = "Windows";
                props["options"]    = BuildPrincipalOptions(wcs.Options);
                break;
            case CertificateCreateLoginSource ccs:
                props["sourceType"] = "Certificate";
                props["sourceName"] = ccs.Certificate?.Value;
                break;
            case AsymmetricKeyCreateLoginSource aks:
                props["sourceType"] = "AsymmetricKey";
                props["sourceName"] = aks.Key?.Value;
                break;
            default:
                props["sourceType"] = s.Source != null ? RawText(s.Source) : null;
                break;
        }
        return Node("CreateLoginStatement", s, props);
    }

    private static SqlNode BuildAlterLogin(AlterLoginStatement s) => s switch
    {
        AlterLoginEnableDisableStatement eds => Node("AlterLoginStatement", eds, new Dictionary<string, object?>
        {
            ["name"]   = eds.Name?.Value,
            ["action"] = eds.IsEnable ? "Enable" : "Disable",
        }),
        AlterLoginAddDropCredentialStatement cds => Node("AlterLoginStatement", cds, new Dictionary<string, object?>
        {
            ["name"]           = cds.Name?.Value,
            ["action"]         = cds.IsAdd ? "AddCredential" : "DropCredential",
            ["credentialName"] = cds.CredentialName?.Value,
        }),
        AlterLoginOptionsStatement opts => Node("AlterLoginStatement", opts, new Dictionary<string, object?>
        {
            ["name"]    = opts.Name?.Value,
            ["action"]  = "WithOptions",
            ["options"] = BuildPrincipalOptions(opts.Options),
        }),
        _ => Leaf("AlterLoginStatement", s, RawText(s)),
    };

    private static SqlNode BuildDropLogin(DropLoginStatement s) =>
        Node("DropLoginStatement", s, new Dictionary<string, object?>
        {
            ["name"]     = s.Name?.Value,
            ["ifExists"] = s.IsIfExists,
        });

    // ROLE

    private static SqlNode BuildCreateRole(CreateRoleStatement s) =>
        Node("CreateRoleStatement", s, new Dictionary<string, object?>
        {
            ["name"]  = s.Name?.Value,
            ["owner"] = s.Owner?.Value,
        });

    private static SqlNode BuildAlterRole(AlterRoleStatement s)
    {
        var props = new Dictionary<string, object?> { ["name"] = s.Name?.Value };
        switch (s.Action)
        {
            case AddMemberAlterRoleAction add:
                props["action"] = "AddMember";
                props["member"] = add.Member?.Value;
                break;
            case DropMemberAlterRoleAction drop:
                props["action"] = "DropMember";
                props["member"] = drop.Member?.Value;
                break;
            case RenameAlterRoleAction ren:
                props["action"]  = "Rename";
                props["newName"] = ren.NewName?.Value;
                break;
            default:
                if (s.Action != null) props["action"] = RawText(s.Action);
                break;
        }
        return Node("AlterRoleStatement", s, props);
    }

    private static SqlNode BuildDropRole(DropRoleStatement s) =>
        Node("DropRoleStatement", s, new Dictionary<string, object?>
        {
            ["name"]     = s.Name?.Value,
            ["ifExists"] = s.IsIfExists,
        });
}
