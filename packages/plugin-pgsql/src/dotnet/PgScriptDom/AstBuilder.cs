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
            Node.NodeOneofCase.TruncateStmt => BuildTruncate(stmt.TruncateStmt, start, end),
            _ => Fallback(start, end),
        };
    }

    // -------------------------------------------------------------------------
    // DML
    // -------------------------------------------------------------------------

    private SqlNode BuildSelect(SelectStmt s, int start, int end) {
        // SET operations (UNION / INTERSECT / EXCEPT)
        if (s.Op != SetOperation.SetopNone) {
            var opName = s.Op switch {
                SetOperation.SetopUnion     => "UNION",
                SetOperation.SetopIntersect => "INTERSECT",
                SetOperation.SetopExcept    => "EXCEPT",
                _                           => s.Op.ToString(),
            };
            return new SqlNode("SetOpStatement", start, end, null, BuildProps(
                ("op",  opName),
                ("all", s.All ? true : null),
                ("lhs", s.Larg != null ? BuildSelect(s.Larg, start, end) : null),
                ("rhs", s.Rarg != null ? BuildSelect(s.Rarg, start, end) : null)
            ));
        }

        // VALUES
        if (s.ValuesLists.Count > 0) {
            var rows = s.ValuesLists
                .Select(r => r.NodeCase == Node.NodeOneofCase.List
                    ? (SqlNode?)new SqlNode("ExprList", 0, 0, null, BuildProps(("items", MapList(r.List.Items, BuildExpr))))
                    : null)
                .Where(n => n != null).Cast<SqlNode>().ToList();
            return new SqlNode("ValuesStatement", start, end, null, BuildProps(
                ("rows", rows.Count > 0 ? (object?)rows : null)
            ));
        }

        // DISTINCT vs DISTINCT ON
        // Plain DISTINCT: DistinctClause contains a single sentinel node (NodeCase == None)
        // DISTINCT ON (expr): DistinctClause contains real expression nodes
        object? distinctFlag = null;
        object? distinctOn = null;
        if (s.DistinctClause.Count > 0) {
            var first = s.DistinctClause[0];
            if (first.NodeCase == Node.NodeOneofCase.None) {
                distinctFlag = true;
            } else {
                distinctOn = MapList(s.DistinctClause, BuildExpr);
            }
        }

        var props = BuildProps(
            ("targetList", MapList(s.TargetList, BuildExpr)),
            ("from",       MapList(s.FromClause, BuildFromItem)),
            ("where",      BuildExpr(s.WhereClause)),
            ("groupBy",    MapList(s.GroupClause, BuildExpr)),
            ("having",     BuildExpr(s.HavingClause)),
            ("orderBy",    MapList(s.SortClause, BuildExpr)),
            ("limit",      BuildExpr(s.LimitCount)),
            ("offset",     BuildExpr(s.LimitOffset)),
            ("ctes",       s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("distinct",   distinctFlag),
            ("distinctOn", distinctOn),
            ("all",        s.All ? true : null),
            ("locking",    MapList(s.LockingClause, BuildLockingClause))
        );
        return new SqlNode("SelectStatement", start, end, null, props);
    }

    private SqlNode BuildInsert(InsertStmt s, int start, int end) {
        SqlNode? source = null;
        if (s.SelectStmt?.NodeCase == Node.NodeOneofCase.SelectStmt) {
            source = BuildSelect(s.SelectStmt.SelectStmt, start, end);
        } else {
            // INSERT ... DEFAULT VALUES (no SELECT or VALUES clause)
            source = new SqlNode("DefaultValues", 0, 0, null, null);
        }

        var overrideStr = s.Override switch {
            OverridingKind.OverridingUserValue   => "USER",
            OverridingKind.OverridingSystemValue => "SYSTEM",
            _                                    => null,
        };

        return new SqlNode("InsertStatement", start, end, null, BuildProps(
            ("ctes",       s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("target",     BuildRangeVar(s.Relation)),
            ("columns",    MapList(s.Cols, BuildExpr)),
            ("override",   overrideStr),
            ("source",     source),
            ("onConflict", s.OnConflictClause != null ? BuildOnConflict(s.OnConflictClause) : null),
            ("returning",  MapList(s.ReturningList, BuildExpr))
        ));
    }

    private SqlNode BuildUpdate(UpdateStmt s, int start, int end) =>
        new("UpdateStatement", start, end, null, BuildProps(
            ("target",    BuildRangeVar(s.Relation)),
            ("sets",      MapList(s.TargetList, BuildExpr)),
            ("from",      MapList(s.FromClause, BuildFromItem)),
            ("where",     BuildExpr(s.WhereClause)),
            ("returning", MapList(s.ReturningList, BuildExpr))
        ));

    private SqlNode BuildDelete(DeleteStmt s, int start, int end) =>
        new("DeleteStatement", start, end, null, BuildProps(
            ("target",    BuildRangeVar(s.Relation)),
            ("using",     MapList(s.UsingClause, BuildFromItem)),
            ("where",     BuildExpr(s.WhereClause)),
            ("returning", MapList(s.ReturningList, BuildExpr))
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
            Node.NodeOneofCase.SqlvalueFunction => BuildSqlvalueFunction(node.SqlvalueFunction),
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

        return e.Kind switch {
            // LIKE / NOT LIKE
            A_Expr_Kind.AexprLike or A_Expr_Kind.AexprIlike => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op", op switch { "~~" => "LIKE", "!~~" => "NOT LIKE", "~~*" => "ILIKE", "!~~*" => "NOT ILIKE", _ => op }),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", BuildExpr(e.Rexpr))
            )),

            // SIMILAR TO (operator name is "~" or "!~")
            A_Expr_Kind.AexprSimilar => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",    op == "!~" ? "NOT SIMILAR TO" : "SIMILAR TO"),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", BuildExpr(e.Rexpr))
            )),

            // IS DISTINCT FROM / IS NOT DISTINCT FROM
            A_Expr_Kind.AexprDistinct => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",    "IS DISTINCT FROM"),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", BuildExpr(e.Rexpr))
            )),
            A_Expr_Kind.AexprNotDistinct => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",    "IS NOT DISTINCT FROM"),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", BuildExpr(e.Rexpr))
            )),

            // NULLIF(a, b)
            A_Expr_Kind.AexprNullif => BuildNullif(e),

            // IN / NOT IN
            A_Expr_Kind.AexprIn => BuildInExpr(e),

            // = ANY(...) / = ALL(...)
            A_Expr_Kind.AexprOpAny => new SqlNode("QuantifiedExpr", 0, 0, null, BuildProps(
                ("op",         op),
                ("quantifier", "ANY"),
                ("left",       BuildExpr(e.Lexpr)),
                ("right",      BuildExpr(e.Rexpr))
            )),
            A_Expr_Kind.AexprOpAll => new SqlNode("QuantifiedExpr", 0, 0, null, BuildProps(
                ("op",         op),
                ("quantifier", "ALL"),
                ("left",       BuildExpr(e.Lexpr)),
                ("right",      BuildExpr(e.Rexpr))
            )),

            // BETWEEN / NOT BETWEEN / BETWEEN SYMMETRIC / NOT BETWEEN SYMMETRIC
            A_Expr_Kind.AexprBetween        => BuildBetween(e, not: false, symmetric: false),
            A_Expr_Kind.AexprNotBetween     => BuildBetween(e, not: true,  symmetric: false),
            A_Expr_Kind.AexprBetweenSym     => BuildBetween(e, not: false, symmetric: true),
            A_Expr_Kind.AexprNotBetweenSym  => BuildBetween(e, not: true,  symmetric: true),

            // Default: plain binary operator
            _ => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",    op),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", BuildExpr(e.Rexpr))
            )),
        };
    }

    private SqlNode BuildNullif(A_Expr e) {
        var left  = BuildExpr(e.Lexpr);
        var right = BuildExpr(e.Rexpr);
        var args  = new List<SqlNode>();
        if (left  != null) args.Add(left);
        if (right != null) args.Add(right);
        return new SqlNode("FunctionCall", 0, 0, null, BuildProps(
            ("name", "NULLIF"),
            ("args", args.Count > 0 ? (object?)args : null)
        ));
    }

    private SqlNode BuildInExpr(A_Expr e) {
        var op = e.Name.Count > 0 ? e.Name[0].String.Sval : "=";
        return new SqlNode("InExpr", 0, 0, null, BuildProps(
            ("left",  BuildExpr(e.Lexpr)),
            ("not",   op == "<>" ? true : null),
            ("values", BuildExpr(e.Rexpr))   // e.Rexpr is a List node → ExprList
        ));
    }

    private SqlNode BuildBetween(A_Expr e, bool not, bool symmetric) {
        // e.Rexpr is a List with exactly two items: [low, high]
        SqlNode? low = null, high = null;
        if (e.Rexpr?.NodeCase == Node.NodeOneofCase.List && e.Rexpr.List.Items.Count >= 2) {
            low  = BuildExpr(e.Rexpr.List.Items[0]);
            high = BuildExpr(e.Rexpr.List.Items[1]);
        }
        return new SqlNode("BetweenExpr", 0, 0, null, BuildProps(
            ("arg",       BuildExpr(e.Lexpr)),
            ("not",       not       ? true : null),
            ("symmetric", symmetric ? true : null),
            ("low",       low),
            ("high",      high)
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
            ("name",     name),
            ("args",     MapList(f.Args, BuildExpr)),
            ("star",     f.AggStar     ? true : null),
            ("distinct", f.AggDistinct ? true : null),
            ("aggOrder", MapList(f.AggOrder, BuildExpr)),
            ("filter",   f.AggFilter != null ? BuildExpr(f.AggFilter) : null),
            ("over",     f.Over != null ? BuildWindowDef(f.Over) : null)
        ));
    }

    private static SqlNode BuildSqlvalueFunction(SQLValueFunction f) {
        var name = f.Op switch {
            SQLValueFunctionOp.SvfopCurrentDate       => "CURRENT_DATE",
            SQLValueFunctionOp.SvfopCurrentTime       => "CURRENT_TIME",
            SQLValueFunctionOp.SvfopCurrentTimeN      => "CURRENT_TIME",
            SQLValueFunctionOp.SvfopCurrentTimestamp  => "CURRENT_TIMESTAMP",
            SQLValueFunctionOp.SvfopCurrentTimestampN => "CURRENT_TIMESTAMP",
            SQLValueFunctionOp.SvfopLocaltime         => "LOCALTIME",
            SQLValueFunctionOp.SvfopLocaltimeN        => "LOCALTIME",
            SQLValueFunctionOp.SvfopLocaltimestamp    => "LOCALTIMESTAMP",
            SQLValueFunctionOp.SvfopLocaltimestampN   => "LOCALTIMESTAMP",
            SQLValueFunctionOp.SvfopCurrentRole       => "CURRENT_ROLE",
            SQLValueFunctionOp.SvfopCurrentUser       => "CURRENT_USER",
            SQLValueFunctionOp.SvfopUser              => "USER",
            SQLValueFunctionOp.SvfopSessionUser       => "SESSION_USER",
            SQLValueFunctionOp.SvfopCurrentCatalog    => "CURRENT_CATALOG",
            SQLValueFunctionOp.SvfopCurrentSchema     => "CURRENT_SCHEMA",
            _                                         => "CURRENT_TIMESTAMP",
        };
        return new SqlNode("SqlvalueFunction", 0, 0, name, null);
    }

    private SqlNode BuildWindowDef(WindowDef w) {
        var fo = w.FrameOptions;

        // FRAMEOPTION_NONDEFAULT (0x00001) is only set when the user explicitly wrote a frame clause.
        // Without it the options reflect PostgreSQL's implicit defaults — omit them from the AST.
        bool explicitFrame = (fo & 0x00001) != 0;

        string? frameMode = null;
        if (explicitFrame) {
            if      ((fo & 0x00002) != 0) frameMode = "RANGE";
            else if ((fo & 0x00004) != 0) frameMode = "ROWS";
            else if ((fo & 0x00008) != 0) frameMode = "GROUPS";
        }

        bool hasBetween = (fo & 0x00010) != 0;

        string? frameStart = null;
        if (explicitFrame) {
            if      ((fo & 0x00020) != 0) frameStart = "UNBOUNDED PRECEDING";
            else if ((fo & 0x00200) != 0) frameStart = "CURRENT ROW";
            else if ((fo & 0x00800) != 0) frameStart = "PRECEDING";
            else if ((fo & 0x02000) != 0) frameStart = "FOLLOWING";
        }

        string? frameEnd = null;
        if (explicitFrame && hasBetween) {
            if      ((fo & 0x00100) != 0) frameEnd = "UNBOUNDED FOLLOWING";
            else if ((fo & 0x00400) != 0) frameEnd = "CURRENT ROW";
            else if ((fo & 0x01000) != 0) frameEnd = "PRECEDING";
            else if ((fo & 0x04000) != 0) frameEnd = "FOLLOWING";
        }

        return new SqlNode("WindowDef", 0, 0, null, BuildProps(
            ("partitionBy",  MapList(w.PartitionClause, BuildExpr)),
            ("orderBy",      MapList(w.OrderClause, BuildExpr)),
            ("frameMode",    frameMode),
            ("frameStart",   frameStart),
            ("startOffset",  w.StartOffset != null ? BuildExpr(w.StartOffset) : null),
            ("frameEnd",     frameEnd),
            ("endOffset",    w.EndOffset != null ? BuildExpr(w.EndOffset) : null)
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
        string joinType;
        if (j.IsNatural) {
            joinType = "NATURAL";
        } else if (j.Jointype == JoinType.JoinInner && j.Quals == null && j.UsingClause.Count == 0) {
            joinType = "CROSS";
        } else {
            joinType = j.Jointype switch {
                JoinType.JoinInner => "INNER",
                JoinType.JoinLeft  => "LEFT",
                JoinType.JoinFull  => "FULL",
                JoinType.JoinRight => "RIGHT",
                _                  => j.Jointype.ToString(),
            };
        }

        return new SqlNode("JoinExpr", 0, 0, null, BuildProps(
            ("joinType", joinType),
            ("lhs",      BuildFromItem(j.Larg)),
            ("rhs",      BuildFromItem(j.Rarg)),
            ("on",       j.Quals != null ? BuildExpr(j.Quals) : null),
            ("using",    MapList(j.UsingClause, n => BuildExpr(n)))
        ));
    }

    private SqlNode BuildRangeSubselect(RangeSubselect r) {
        var subquery = r.Subquery?.NodeCase == Node.NodeOneofCase.SelectStmt
            ? BuildSelect(r.Subquery.SelectStmt, 0, _sql.Length)
            : null;
        return new SqlNode("Subquery", 0, 0, null, BuildProps(
            ("subquery", subquery),
            ("alias",    r.Alias?.Aliasname),
            ("lateral",  r.Lateral ? true : null)
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
            SqlNode? query = cte.Ctequery?.NodeCase switch {
                Node.NodeOneofCase.SelectStmt => BuildSelect(cte.Ctequery.SelectStmt, 0, _sql.Length),
                Node.NodeOneofCase.InsertStmt => BuildInsert(cte.Ctequery.InsertStmt, 0, _sql.Length),
                Node.NodeOneofCase.UpdateStmt => BuildUpdate(cte.Ctequery.UpdateStmt, 0, _sql.Length),
                Node.NodeOneofCase.DeleteStmt => BuildDelete(cte.Ctequery.DeleteStmt, 0, _sql.Length),
                _ => null,
            };
            return new SqlNode("CTE", 0, 0, null, BuildProps(
                ("name",  cte.Ctename),
                ("query", query)
            ));
        });
        return new SqlNode("WithClause", 0, 0, null, BuildProps(
            ("ctes",      ctes),
            ("recursive", w.Recursive ? true : null)
        ));
    }

    // -------------------------------------------------------------------------
    // ON CONFLICT
    // -------------------------------------------------------------------------

    private SqlNode BuildOnConflict(OnConflictClause c) {
        var action = c.Action switch {
            OnConflictAction.OnconflictNothing => "NOTHING",
            OnConflictAction.OnconflictUpdate  => "UPDATE",
            _                                  => null,
        };
        return new SqlNode("OnConflict", 0, 0, null, BuildProps(
            ("action", action),
            ("target", c.Infer != null ? BuildInferClause(c.Infer) : null),
            ("sets",   MapList(c.TargetList, BuildExpr)),
            ("where",  c.WhereClause != null ? BuildExpr(c.WhereClause) : null)
        ));
    }

    private SqlNode BuildInferClause(InferClause i) =>
        new("InferClause", 0, 0, null, BuildProps(
            ("columns",    MapList(i.IndexElems, BuildIndexElem)),
            ("constraint", i.Conname)
        ));

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

    private static SqlNode? BuildLockingClause(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.LockingClause) return null;
        var lc = n.LockingClause;
        var strength = lc.Strength switch {
            LockClauseStrength.LcsForupdate       => "FOR UPDATE",
            LockClauseStrength.LcsFornokeyupdate  => "FOR NO KEY UPDATE",
            LockClauseStrength.LcsForshare        => "FOR SHARE",
            LockClauseStrength.LcsForkeyshare     => "FOR KEY SHARE",
            _                                     => "FOR UPDATE",
        };
        var waitPolicy = lc.WaitPolicy switch {
            LockWaitPolicy.LockWaitSkip  => "SKIP LOCKED",
            LockWaitPolicy.LockWaitError => "NOWAIT",
            _                            => null,
        };
        var tables = lc.LockedRels.Count > 0
            ? (object?)lc.LockedRels
                .Where(r => r.NodeCase == Node.NodeOneofCase.RangeVar)
                .Select(r => BuildRangeVar(r.RangeVar))
                .ToList()
            : null;
        return new SqlNode("LockingClause", 0, 0, null, BuildProps(
            ("strength",   strength),
            ("tables",     tables),
            ("waitPolicy", waitPolicy)
        ));
    }

    private SqlNode BuildTruncate(TruncateStmt s, int start, int end) {
        var relations = s.Relations
            .Where(n => n.NodeCase == Node.NodeOneofCase.RangeVar)
            .Select(n => BuildRangeVar(n.RangeVar))
            .ToList();
        return new SqlNode("TruncateStatement", start, end, null, BuildProps(
            ("relations",   relations.Count > 0 ? (object?)relations : null),
            ("restartSeqs", s.RestartSeqs ? true : null),
            ("cascade",     s.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

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
