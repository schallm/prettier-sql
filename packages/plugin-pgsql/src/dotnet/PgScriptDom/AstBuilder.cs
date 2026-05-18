using PgSqlParser;

namespace PrettierPgsql;

/// <summary>
/// Walks the libpg_query protobuf parse tree and builds a simplified SqlNode tree.
/// Unlike ScriptDom's visitor pattern, we manually dispatch on the Node.NodeCase oneof
/// because libpg_query provides a union-typed protobuf tree rather than typed objects.
/// </summary>
public class AstBuilder {
    private readonly string _sql;

    public AstBuilder(string sql) {
        _sql = sql;
    }

    public SqlNode Build(ParseResult parseResult) {
        var stmts = MapList(parseResult.Stmts, BuildRawStmt);
        return new SqlNode("PgScript", 0, _sql.Length, null, new() {
            ["statements"] = stmts,
        });
    }

    // -------------------------------------------------------------------------
    // Statement dispatch
    // -------------------------------------------------------------------------

    private SqlNode? BuildRawStmt(RawStmt rawStmt) {
        var stmt = rawStmt.Stmt;
        if (stmt == null) return null;

        int start = rawStmt.StmtLocation;
        int end = rawStmt.StmtLen > 0 ? start + rawStmt.StmtLen : _sql.Length;

        return stmt.NodeCase switch {
            Node.NodeOneofCase.SelectStmt => BuildSelect(stmt.SelectStmt, start, end),
            Node.NodeOneofCase.InsertStmt => BuildInsert(stmt.InsertStmt, start, end),
            Node.NodeOneofCase.UpdateStmt => BuildUpdate(stmt.UpdateStmt, start, end),
            Node.NodeOneofCase.DeleteStmt => BuildDelete(stmt.DeleteStmt, start, end),
            Node.NodeOneofCase.CreateStmt => BuildCreateTable(stmt.CreateStmt, start, end),
            Node.NodeOneofCase.AlterTableStmt => BuildAlterTable(stmt.AlterTableStmt, start, end),
            Node.NodeOneofCase.ViewStmt => BuildCreateView(stmt.ViewStmt, start, end),
            Node.NodeOneofCase.CreateFunctionStmt => BuildCreateFunction(stmt.CreateFunctionStmt, start, end),
            Node.NodeOneofCase.IndexStmt => BuildCreateIndex(stmt.IndexStmt, start, end),
            Node.NodeOneofCase.DropStmt => BuildDrop(stmt.DropStmt, start, end),
            _ => Fallback(start, end),
        };
    }

    // -------------------------------------------------------------------------
    // DML
    // -------------------------------------------------------------------------

    private SqlNode BuildSelect(SelectStmt s, int start, int end) {
        var props = BuildProps(
            ("targetList", MapList(s.TargetList, BuildExpr)),
            ("from", MapList(s.FromClause, BuildFromItem)),
            ("where", BuildExpr(s.WhereClause)),
            ("groupBy", MapList(s.GroupClause, BuildExpr)),
            ("having", BuildExpr(s.HavingClause)),
            ("orderBy", MapList(s.SortClause, BuildExpr)),
            ("limit", BuildExpr(s.LimitCount)),
            ("offset", BuildExpr(s.LimitOffset)),
            ("ctes", s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("distinct", s.DistinctClause.Count > 0 ? (object?)true : null),
            ("all", s.All ? true : null)
        );
        return new SqlNode("SelectStatement", start, end, null, props);
    }

    private SqlNode BuildInsert(InsertStmt s, int start, int end) =>
        new("InsertStatement", start, end, null, BuildProps(
            ("target", BuildRangeVar(s.Relation)),
            ("columns", MapList(s.Cols, BuildExpr)),
            ("source", s.SelectStmt?.NodeCase == Node.NodeOneofCase.SelectStmt
                ? BuildSelect(s.SelectStmt.SelectStmt, start, end)
                : null)
        ));

    private SqlNode BuildUpdate(UpdateStmt s, int start, int end) =>
        new("UpdateStatement", start, end, null, BuildProps(
            ("target", BuildRangeVar(s.Relation)),
            ("sets", MapList(s.TargetList, BuildExpr)),
            ("from", MapList(s.FromClause, BuildFromItem)),
            ("where", BuildExpr(s.WhereClause))
        ));

    private SqlNode BuildDelete(DeleteStmt s, int start, int end) =>
        new("DeleteStatement", start, end, null, BuildProps(
            ("target", BuildRangeVar(s.Relation)),
            ("using", MapList(s.UsingClause, BuildFromItem)),
            ("where", BuildExpr(s.WhereClause))
        ));

    // -------------------------------------------------------------------------
    // DDL
    // -------------------------------------------------------------------------

    private SqlNode BuildCreateTable(CreateStmt s, int start, int end) =>
        new("CreateTableStatement", start, end, null, BuildProps(
            ("name", BuildRangeVar(s.Relation)),
            ("columns", MapList(s.TableElts, BuildTableElement))
        ));

    private SqlNode BuildAlterTable(AlterTableStmt s, int start, int end) =>
        new("AlterTableStatement", start, end, null, BuildProps(
            ("name", BuildRangeVar(s.Relation)),
            ("commands", MapList(s.Cmds, BuildAlterCmd))
        ));

    private SqlNode BuildCreateView(ViewStmt s, int start, int end) =>
        new("CreateViewStatement", start, end, null, BuildProps(
            ("name", BuildRangeVar(s.View)),
            ("body", s.Query?.NodeCase == Node.NodeOneofCase.SelectStmt
                ? BuildSelect(s.Query.SelectStmt, start, end)
                : null)
        ));

    private SqlNode BuildCreateFunction(CreateFunctionStmt s, int start, int end) =>
        new("CreateFunctionStatement", start, end, null, BuildProps(
            ("name", s.Funcname.Count > 0 ? string.Join(".", s.Funcname.Select(n => n.String.Sval)) : null),
            ("parameters", MapList(s.Parameters, BuildFunctionParam))
        ));

    private SqlNode BuildCreateIndex(IndexStmt s, int start, int end) =>
        new("CreateIndexStatement", start, end, null, BuildProps(
            ("indexName", s.Idxname),
            ("relation", BuildRangeVar(s.Relation)),
            ("columns", MapList(s.IndexParams, BuildIndexElem)),
            ("unique", s.Unique ? true : null)
        ));

    private static SqlNode BuildDrop(DropStmt s, int start, int end) =>
        new("DropStatement", start, end, null, BuildProps(
            ("objectType", s.RemoveType.ToString()),
            ("ifExists", s.MissingOk ? true : null),
            ("cascade", s.Behavior == DropBehavior.DropCascade ? true : null)
        ));

    // -------------------------------------------------------------------------
    // Expressions
    // -------------------------------------------------------------------------

    private SqlNode? BuildExpr(Node? node) {
        if (node == null) return null;
        return node.NodeCase switch {
            Node.NodeOneofCase.AConst => BuildAConst(node.AConst),
            Node.NodeOneofCase.ColumnRef => BuildColumnRef(node.ColumnRef),
            Node.NodeOneofCase.AExpr => BuildAExpr(node.AExpr),
            Node.NodeOneofCase.BoolExpr => BuildBoolExpr(node.BoolExpr),
            Node.NodeOneofCase.FuncCall => BuildFuncCall(node.FuncCall),
            Node.NodeOneofCase.TypeCast => BuildTypeCast(node.TypeCast),
            Node.NodeOneofCase.SubLink => BuildSubLink(node.SubLink),
            Node.NodeOneofCase.CaseExpr => BuildCaseExpr(node.CaseExpr),
            Node.NodeOneofCase.NullTest => BuildNullTest(node.NullTest),
            Node.NodeOneofCase.BooleanTest => BuildBooleanTest(node.BooleanTest),
            Node.NodeOneofCase.ResTarget => BuildResTarget(node.ResTarget),
            Node.NodeOneofCase.SelectStmt => BuildSelect(node.SelectStmt, 0, _sql.Length),
            Node.NodeOneofCase.RowExpr => BuildRowExpr(node.RowExpr),
            Node.NodeOneofCase.Integer => new SqlNode("Literal", 0, 0, node.Integer.Ival.ToString(), null),
            Node.NodeOneofCase.Float => new SqlNode("Literal", 0, 0, node.Float.Fval, null),
            Node.NodeOneofCase.String => new SqlNode("Literal", 0, 0, $"'{node.String.Sval.Replace("'", "''")}'", null),
            Node.NodeOneofCase.ParamRef => new SqlNode("ParamRef", 0, 0, $"${node.ParamRef.Number}", null),
            Node.NodeOneofCase.AArrayExpr => BuildArrayExpr(node.AArrayExpr),
            Node.NodeOneofCase.CoalesceExpr => BuildCoalesceExpr(node.CoalesceExpr),
            Node.NodeOneofCase.MinMaxExpr => BuildMinMaxExpr(node.MinMaxExpr),
            Node.NodeOneofCase.SortBy => BuildSortBy(node.SortBy),
            Node.NodeOneofCase.RangeVar => BuildRangeVar(node.RangeVar),
            Node.NodeOneofCase.JoinExpr => BuildJoinExpr(node.JoinExpr),
            Node.NodeOneofCase.RangeSubselect => BuildRangeSubselect(node.RangeSubselect),
            Node.NodeOneofCase.RangeFunction => BuildRangeFunction(node.RangeFunction),
            Node.NodeOneofCase.List => BuildExprList(node.List),
            _ => new SqlNode("RawExpr", 0, 0, node.NodeCase.ToString(), null),
        };
    }

    private static SqlNode BuildAConst(A_Const c) {
        if (c.Isnull) return new SqlNode("Literal", 0, 0, "null", null);
        string? text = c.ValCase switch {
            A_Const.ValOneofCase.Ival => c.Ival.Ival.ToString(),
            A_Const.ValOneofCase.Fval => c.Fval.Fval,
            A_Const.ValOneofCase.Sval => $"'{c.Sval.Sval.Replace("'", "''")}'",
            A_Const.ValOneofCase.Boolval => c.Boolval.Boolval ? "true" : "false",
            _ => null,
        };
        return new SqlNode("Literal", 0, 0, text, null);
    }

    private static SqlNode BuildColumnRef(ColumnRef c) {
        var parts = c.Fields.Select(f => f.NodeCase switch {
            Node.NodeOneofCase.String => f.String.Sval,
            Node.NodeOneofCase.AStar => "*",
            _ => "",
        });
        return new SqlNode("ColumnRef", 0, 0, null, new() { ["name"] = string.Join(".", parts) });
    }

    private SqlNode BuildAExpr(A_Expr e) {
        var op = e.Name.Count > 0 ? e.Name[0].String.Sval : "?";
        return new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
            ("op", op),
            ("left", BuildExpr(e.Lexpr)),
            ("right", BuildExpr(e.Rexpr))
        ));
    }

    private SqlNode BuildBoolExpr(BoolExpr b) {
        var op = b.Boolop switch {
            BoolExprType.AndExpr => "AND",
            BoolExprType.OrExpr => "OR",
            BoolExprType.NotExpr => "NOT",
            _ => b.Boolop.ToString(),
        };
        return new SqlNode("BoolExpr", 0, 0, null, BuildProps(
            ("op", op),
            ("args", MapList(b.Args, BuildExpr))
        ));
    }

    private SqlNode BuildFuncCall(FuncCall f) {
        var name = string.Join(".", f.Funcname.Select(n => n.String.Sval));
        return new SqlNode("FunctionCall", 0, 0, null, BuildProps(
            ("name", name),
            ("args", MapList(f.Args, BuildExpr)),
            ("star", f.AggStar ? true : null),
            ("distinct", f.AggDistinct ? true : null)
        ));
    }

    private SqlNode BuildTypeCast(TypeCast t) =>
        new("Cast", 0, 0, null, BuildProps(
            ("arg", BuildExpr(t.Arg)),
            ("typeName", t.TypeName != null ? BuildPgTypeName(t.TypeName) : null)
        ));

    private SqlNode BuildSubLink(SubLink s) {
        var type = s.SubLinkType switch {
            SubLinkType.ExistsSublink => "EXISTS",
            SubLinkType.AllSublink => "ALL",
            SubLinkType.AnySublink => "ANY",
            SubLinkType.ExprSublink => "SCALAR",
            _ => s.SubLinkType.ToString(),
        };
        var subquery = s.Subselect?.NodeCase == Node.NodeOneofCase.SelectStmt
            ? BuildSelect(s.Subselect.SelectStmt, 0, _sql.Length)
            : null;
        return new SqlNode("SubLink", 0, 0, null, BuildProps(
            ("type", type),
            ("subquery", subquery)
        ));
    }

    private SqlNode BuildCaseExpr(CaseExpr c) =>
        new("CaseExpr", 0, 0, null, BuildProps(
            ("arg", c.Arg != null ? BuildExpr(c.Arg) : null),
            ("whens", MapList(c.Args, BuildCaseWhen)),
            ("else", c.Defresult != null ? BuildExpr(c.Defresult) : null)
        ));

    private SqlNode? BuildCaseWhen(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.CaseWhen) return null;
        var w = n.CaseWhen;
        return new SqlNode("CaseWhen", 0, 0, null, BuildProps(
            ("condition", BuildExpr(w.Expr)),
            ("result", BuildExpr(w.Result))
        ));
    }

    private SqlNode BuildNullTest(NullTest t) =>
        new("NullTest", 0, 0, null, BuildProps(
            ("arg", BuildExpr(t.Arg)),
            ("isNull", t.Nulltesttype == NullTestType.IsNull)
        ));

    private SqlNode BuildBooleanTest(BooleanTest t) =>
        new("BooleanTest", 0, 0, null, BuildProps(
            ("arg", BuildExpr(t.Arg)),
            ("test", t.Booltesttype.ToString())
        ));

    private SqlNode BuildRowExpr(RowExpr r) =>
        new("RowExpr", 0, 0, null, BuildProps(
            ("args", MapList(r.Args, BuildExpr))
        ));

    private SqlNode BuildExprList(List l) {
        var items = MapList(l.Items, BuildExpr);
        return new SqlNode("ExprList", 0, 0, null, BuildProps(("items", items)));
    }

    private SqlNode BuildArrayExpr(A_ArrayExpr a) =>
        new("ArrayExpr", 0, 0, null, BuildProps(
            ("elements", MapList(a.Elements, BuildExpr))
        ));

    private SqlNode BuildCoalesceExpr(CoalesceExpr c) =>
        new("Coalesce", 0, 0, null, BuildProps(
            ("args", MapList(c.Args, BuildExpr))
        ));

    private SqlNode BuildMinMaxExpr(MinMaxExpr m) =>
        new("FunctionCall", 0, 0, null, BuildProps(
            ("name", m.Op == MinMaxOp.IsGreatest ? "GREATEST" : "LEAST"),
            ("args", MapList(m.Args, BuildExpr))
        ));

    private SqlNode BuildSortBy(SortBy s) =>
        new("SortItem", 0, 0, null, BuildProps(
            ("expr", BuildExpr(s.Node)),
            ("direction", s.SortbyDir switch {
                SortByDir.SortbyAsc => "ASC",
                SortByDir.SortbyDesc => "DESC",
                _ => null,
            })
        ));

    private SqlNode BuildResTarget(ResTarget r) =>
        new("ResTarget", 0, 0, null, BuildProps(
            ("name", r.Name),
            ("val", r.Val != null ? BuildExpr(r.Val) : null)
        ));

    // -------------------------------------------------------------------------
    // FROM clause
    // -------------------------------------------------------------------------

    private SqlNode? BuildFromItem(Node n) => n.NodeCase switch {
        Node.NodeOneofCase.RangeVar => BuildRangeVar(n.RangeVar),
        Node.NodeOneofCase.JoinExpr => BuildJoinExpr(n.JoinExpr),
        Node.NodeOneofCase.RangeSubselect => BuildRangeSubselect(n.RangeSubselect),
        Node.NodeOneofCase.RangeFunction => BuildRangeFunction(n.RangeFunction),
        _ => new SqlNode("RawFrom", 0, 0, n.NodeCase.ToString(), null),
    };

    private static SqlNode BuildRangeVar(RangeVar? r) {
        if (r == null) return new SqlNode("RangeVar", 0, 0, null, null);
        return new SqlNode("RangeVar", 0, 0, null, BuildProps(
            ("schema", r.Schemaname),
            ("name", r.Relname),
            ("alias", r.Alias?.Aliasname)
        ));
    }

    private SqlNode BuildJoinExpr(JoinExpr j) {
        var joinType = j.Jointype switch {
            JoinType.JoinInner => j.IsNatural ? "NATURAL" : "INNER",
            JoinType.JoinLeft => "LEFT",
            JoinType.JoinFull => "FULL",
            JoinType.JoinRight => "RIGHT",
            _ => j.Jointype.ToString(),
        };
        return new SqlNode("JoinExpr", 0, 0, null, BuildProps(
            ("joinType", joinType),
            ("lhs", BuildFromItem(j.Larg)),
            ("rhs", BuildFromItem(j.Rarg)),
            ("on", j.Quals != null ? BuildExpr(j.Quals) : null),
            ("using", MapList(j.UsingClause, n => BuildExpr(n)))
        ));
    }

    private SqlNode BuildRangeSubselect(RangeSubselect r) {
        var subquery = r.Subquery?.NodeCase == Node.NodeOneofCase.SelectStmt
            ? BuildSelect(r.Subquery.SelectStmt, 0, _sql.Length)
            : null;
        return new SqlNode("Subquery", 0, 0, null, BuildProps(
            ("subquery", subquery),
            ("alias", r.Alias?.Aliasname)
        ));
    }

    private SqlNode BuildRangeFunction(RangeFunction r) =>
        new("RangeFunction", 0, 0, null, BuildProps(
            ("functions", MapList(r.Functions, BuildExpr)),
            ("alias", r.Alias?.Aliasname)
        ));

    // -------------------------------------------------------------------------
    // WITH / CTEs
    // -------------------------------------------------------------------------

    private SqlNode BuildWithClause(WithClause w) {
        var ctes = MapList(w.Ctes, n => {
            if (n.NodeCase != Node.NodeOneofCase.CommonTableExpr) return null;
            var cte = n.CommonTableExpr;
            var query = cte.Ctequery?.NodeCase == Node.NodeOneofCase.SelectStmt
                ? BuildSelect(cte.Ctequery.SelectStmt, 0, _sql.Length)
                : null;
            return new SqlNode("CTE", 0, 0, null, BuildProps(
                ("name", cte.Ctename),
                ("query", query)
            ));
        });
        return new SqlNode("WithClause", 0, 0, null, BuildProps(
            ("ctes", ctes),
            ("recursive", w.Recursive ? true : null)
        ));
    }

    // -------------------------------------------------------------------------
    // DDL pieces
    // -------------------------------------------------------------------------

    private SqlNode? BuildTableElement(Node n) => n.NodeCase switch {
        Node.NodeOneofCase.ColumnDef => BuildColumnDef(n.ColumnDef),
        Node.NodeOneofCase.Constraint => BuildConstraint(n.Constraint),
        _ => null,
    };

    private SqlNode BuildColumnDef(ColumnDef c) =>
        new("ColumnDef", 0, 0, null, BuildProps(
            ("name", c.Colname),
            ("typeName", c.TypeName != null ? BuildPgTypeName(c.TypeName) : null)
        ));

    private static SqlNode BuildConstraint(Constraint c) =>
        new("Constraint", 0, 0, null, BuildProps(
            ("contype", c.Contype.ToString()),
            ("name", c.Conname)
        ));

    private static SqlNode? BuildAlterCmd(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.AlterTableCmd) return null;
        var cmd = n.AlterTableCmd;
        return new SqlNode("AlterCmd", 0, 0, null, BuildProps(
            ("subtype", cmd.Subtype.ToString()),
            ("name", cmd.Name)
        ));
    }

    private static SqlNode? BuildFunctionParam(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.FunctionParameter) return null;
        var p = n.FunctionParameter;
        return new SqlNode("FunctionParam", 0, 0, null, BuildProps(
            ("name", p.Name),
            ("typeName", p.ArgType != null ? BuildPgTypeName(p.ArgType) : null),
            ("mode", p.Mode.ToString())
        ));
    }

    private static SqlNode? BuildIndexElem(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.IndexElem) return null;
        return new SqlNode("IndexElem", 0, 0, null, BuildProps(("name", n.IndexElem.Name)));
    }

    private static string BuildPgTypeName(TypeName t) =>
        string.Join(".", t.Names.Select(n => n.String.Sval).Where(s => s != "pg_catalog"));

    private static SqlNode Fallback(int start, int end) =>
        new("UnknownStatement", start, end, null, null);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static List<SqlNode>? MapList<T>(
        IEnumerable<T>? items,
        Func<T, SqlNode?> map
    ) {
        if (items == null) return null;
        var list = items.Select(map).Where(n => n != null).Cast<SqlNode>().ToList();
        return list.Count > 0 ? list : null;
    }

    private static Dictionary<string, object?> BuildProps(
        params (string key, object? value)[] entries
    ) {
        var dict = new Dictionary<string, object?>();
        foreach (var (key, value) in entries) {
            if (value != null) dict[key] = value;
        }
        return dict;
    }
}
