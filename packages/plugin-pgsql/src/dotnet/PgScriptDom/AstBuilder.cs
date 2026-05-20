using PgSqlParser;
using PrettierSql.Core;

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
            Node.NodeOneofCase.TransactionStmt => BuildTransaction(stmt.TransactionStmt, start, end),
            Node.NodeOneofCase.VariableSetStmt => BuildVariableSet(stmt.VariableSetStmt, start, end),
            Node.NodeOneofCase.CallStmt => BuildCall(stmt.CallStmt, start, end),
            Node.NodeOneofCase.DoStmt => BuildDo(stmt.DoStmt, start, end),
            Node.NodeOneofCase.MergeStmt => BuildMerge(stmt.MergeStmt, start, end),
            Node.NodeOneofCase.GrantStmt                => BuildGrant(stmt.GrantStmt, start, end),
            Node.NodeOneofCase.CreateRoleStmt           => BuildCreateRole(stmt.CreateRoleStmt, start, end),
            Node.NodeOneofCase.AlterRoleStmt            => BuildAlterRole(stmt.AlterRoleStmt, start, end),
            Node.NodeOneofCase.RenameStmt               => BuildRename(stmt.RenameStmt, start, end),
            Node.NodeOneofCase.VariableShowStmt         => BuildVariableShow(stmt.VariableShowStmt, start, end),
            Node.NodeOneofCase.CompositeTypeStmt        => BuildCreateCompositeType(stmt.CompositeTypeStmt, start, end),
            Node.NodeOneofCase.CreateEnumStmt           => BuildCreateEnumType(stmt.CreateEnumStmt, start, end),
            Node.NodeOneofCase.AlterEnumStmt            => BuildAlterEnum(stmt.AlterEnumStmt, start, end),
            Node.NodeOneofCase.CreateSeqStmt            => BuildCreateSeq(stmt.CreateSeqStmt, start, end),
            Node.NodeOneofCase.AlterSeqStmt             => BuildAlterSeq(stmt.AlterSeqStmt, start, end),
            Node.NodeOneofCase.CreateSchemaStmt         => BuildCreateSchema(stmt.CreateSchemaStmt, start, end),
            Node.NodeOneofCase.CreateExtensionStmt      => BuildCreateExtension(stmt.CreateExtensionStmt, start, end),
            Node.NodeOneofCase.CreateTableAsStmt        => BuildCreateTableAs(stmt.CreateTableAsStmt, start, end),
            Node.NodeOneofCase.CreateTrigStmt           => BuildCreateTrigger(stmt.CreateTrigStmt, start, end),
            Node.NodeOneofCase.CommentStmt              => BuildComment(stmt.CommentStmt, start, end),
            Node.NodeOneofCase.AlterFunctionStmt        => BuildAlterFunction(stmt.AlterFunctionStmt, start, end),
            Node.NodeOneofCase.RefreshMatViewStmt       => BuildRefreshMatView(stmt.RefreshMatViewStmt, start, end),
            Node.NodeOneofCase.RuleStmt                 => BuildRule(stmt.RuleStmt, start, end),
            Node.NodeOneofCase.CreatePolicyStmt         => BuildCreatePolicy(stmt.CreatePolicyStmt, start, end),
            Node.NodeOneofCase.AlterPolicyStmt          => BuildAlterPolicy(stmt.AlterPolicyStmt, start, end),
            Node.NodeOneofCase.DeclareCursorStmt        => BuildDeclareCursor(stmt.DeclareCursorStmt, start, end),
            Node.NodeOneofCase.FetchStmt                => BuildFetch(stmt.FetchStmt, start, end),
            Node.NodeOneofCase.ClosePortalStmt          => BuildClosePortal(stmt.ClosePortalStmt, start, end),
            Node.NodeOneofCase.CopyStmt                 => BuildCopy(stmt.CopyStmt, start, end),
            Node.NodeOneofCase.ExplainStmt              => BuildExplain(stmt.ExplainStmt, start, end),
            Node.NodeOneofCase.PrepareStmt              => BuildPrepare(stmt.PrepareStmt, start, end),
            Node.NodeOneofCase.ExecuteStmt              => BuildExecute(stmt.ExecuteStmt, start, end),
            Node.NodeOneofCase.DeallocateStmt           => BuildDeallocate(stmt.DeallocateStmt, start, end),
            Node.NodeOneofCase.ListenStmt               => BuildListen(stmt.ListenStmt, start, end),
            Node.NodeOneofCase.UnlistenStmt             => BuildUnlisten(stmt.UnlistenStmt, start, end),
            Node.NodeOneofCase.NotifyStmt               => BuildNotify(stmt.NotifyStmt, start, end),
            Node.NodeOneofCase.LockStmt                 => BuildLock(stmt.LockStmt, start, end),
            Node.NodeOneofCase.VacuumStmt               => BuildVacuum(stmt.VacuumStmt, start, end),
            Node.NodeOneofCase.ClusterStmt              => BuildCluster(stmt.ClusterStmt, start, end),
            Node.NodeOneofCase.ReindexStmt              => BuildReindex(stmt.ReindexStmt, start, end),
            Node.NodeOneofCase.CreateForeignServerStmt  => BuildCreateForeignServer(stmt.CreateForeignServerStmt, start, end),
            Node.NodeOneofCase.CreateForeignTableStmt   => BuildCreateForeignTable(stmt.CreateForeignTableStmt, start, end),
            Node.NodeOneofCase.CreateUserMappingStmt    => BuildCreateUserMapping(stmt.CreateUserMappingStmt, start, end),
            Node.NodeOneofCase.ImportForeignSchemaStmt  => BuildImportForeignSchema(stmt.ImportForeignSchemaStmt, start, end),
            Node.NodeOneofCase.CreatePublicationStmt    => BuildCreatePublication(stmt.CreatePublicationStmt, start, end),
            Node.NodeOneofCase.AlterPublicationStmt     => BuildAlterPublication(stmt.AlterPublicationStmt, start, end),
            Node.NodeOneofCase.CreateSubscriptionStmt   => BuildCreateSubscription(stmt.CreateSubscriptionStmt, start, end),
            Node.NodeOneofCase.AlterSubscriptionStmt    => BuildAlterSubscription(stmt.AlterSubscriptionStmt, start, end),
            Node.NodeOneofCase.DropSubscriptionStmt     => BuildDropSubscription(stmt.DropSubscriptionStmt, start, end),
            Node.NodeOneofCase.DefineStmt               => BuildDefine(stmt.DefineStmt, start, end),
            Node.NodeOneofCase.SecLabelStmt             => BuildSecLabel(stmt.SecLabelStmt, start, end),
            Node.NodeOneofCase.AlterOwnerStmt           => BuildAlterOwner(stmt.AlterOwnerStmt, start, end),
            Node.NodeOneofCase.AlterObjectSchemaStmt    => BuildAlterObjectSchema(stmt.AlterObjectSchemaStmt, start, end),
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
                ("rows", MaybeList(rows))
            ));
        }

        // SELECT INTO
        if (s.IntoClause != null) {
            var rel = BuildRangeVar(s.IntoClause.Rel);
            var temp = s.IntoClause.Rel?.Relpersistence == "t";
            var intoProps = BuildProps(
                ("temp",       temp ? true : null),
                ("into",       rel),
                ("targetList", MapList(s.TargetList, BuildExpr)),
                ("from",       MapList(s.FromClause, BuildFromItem)),
                ("where",      BuildExpr(s.WhereClause)),
                ("groupBy",    MapList(s.GroupClause, BuildExpr)),
                ("having",     BuildExpr(s.HavingClause)),
                ("orderBy",    MapList(s.SortClause, BuildExpr)),
                ("limit",      BuildExpr(s.LimitCount)),
                ("offset",     BuildExpr(s.LimitOffset))
            );
            return new SqlNode("SelectIntoStatement", start, end, null, intoProps);
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
            ("targetList",    MapList(s.TargetList, BuildExpr)),
            ("from",          MapList(s.FromClause, BuildFromItem)),
            ("where",         BuildExpr(s.WhereClause)),
            ("groupBy",       MapList(s.GroupClause, BuildExpr)),
            ("having",        BuildExpr(s.HavingClause)),
            ("orderBy",       MapList(s.SortClause, BuildExpr)),
            ("limit",         BuildExpr(s.LimitCount)),
            ("offset",        BuildExpr(s.LimitOffset)),
            ("ctes",          s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("distinct",      distinctFlag),
            ("distinctOn",    distinctOn),
            ("all",           s.All ? true : null),
            ("locking",       MapList(s.LockingClause, BuildLockingClause)),
            ("windowClauses", s.WindowClause.Count > 0
                ? (object?)s.WindowClause
                    .Where(n => n.NodeCase == Node.NodeOneofCase.WindowDef)
                    .Select(n => BuildWindowDef(n.WindowDef))
                    .ToList()
                : null)
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
            ("ctes",      s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("target",    BuildRangeVar(s.Relation)),
            ("sets",      MapList(s.TargetList, BuildExpr)),
            ("from",      MapList(s.FromClause, BuildFromItem)),
            ("where",     BuildExpr(s.WhereClause)),
            ("returning", MapList(s.ReturningList, BuildExpr))
        ));

    private SqlNode BuildDelete(DeleteStmt s, int start, int end) =>
        new("DeleteStatement", start, end, null, BuildProps(
            ("ctes",      s.WithClause != null ? BuildWithClause(s.WithClause) : null),
            ("target",    BuildRangeVar(s.Relation)),
            ("using",     MapList(s.UsingClause, BuildFromItem)),
            ("where",     BuildExpr(s.WhereClause)),
            ("returning", MapList(s.ReturningList, BuildExpr))
        ));

    // -------------------------------------------------------------------------
    // DDL
    // -------------------------------------------------------------------------

    private SqlNode BuildCreateTable(CreateStmt s, int start, int end) {
        // PARTITION OF: inherits from a parent table
        if (s.InhRelations.Count > 0 && s.Partbound != null) {
            var parent = s.InhRelations[0].NodeCase == Node.NodeOneofCase.RangeVar
                ? BuildRangeVar(s.InhRelations[0].RangeVar)
                : null;
            SqlNode? bound = BuildPartitionBound(s.Partbound);
            return new SqlNode("CreateTablePartitionOfStatement", start, end, null, BuildProps(
                ("name",   BuildRangeVar(s.Relation)),
                ("parent", parent),
                ("bound",  bound)
            ));
        }

        // PARTITION BY: table with partition strategy
        SqlNode? partitionBy = null;
        if (s.Partspec != null) {
            var strategy = s.Partspec.Strategy switch {
                PartitionStrategy.Range => "range",
                PartitionStrategy.List  => "list",
                PartitionStrategy.Hash  => "hash",
                _                      => s.Partspec.Strategy.ToString().ToLower(),
            };
            var cols = s.Partspec.PartParams
                .Select(n => {
                    if (n.NodeCase == Node.NodeOneofCase.PartitionElem) {
                        var pe = n.PartitionElem;
                        if (!string.IsNullOrEmpty(pe.Name)) return pe.Name;
                        // Expression-based partition element: extract ColumnRef name
                        if (pe.Expr?.NodeCase == Node.NodeOneofCase.ColumnRef) {
                            var fields = pe.Expr.ColumnRef.Fields;
                            if (fields.Count > 0 && fields[0].NodeCase == Node.NodeOneofCase.String)
                                return fields[0].String.Sval;
                        }
                    }
                    return null;
                })
                .Where(c => !string.IsNullOrEmpty(c))
                .Cast<string>()
                .ToList();
            partitionBy = new SqlNode("PartitionBy", 0, 0, null, BuildProps(
                ("strategy", strategy),
                ("columns",  MaybeList(cols))
            ));
        }

        return new SqlNode("CreateTableStatement", start, end, null, BuildProps(
            ("name",        BuildRangeVar(s.Relation)),
            ("columns",     MapList(s.TableElts, BuildTableElement)),
            ("partitionBy", partitionBy)
        ));
    }

    private SqlNode? BuildPartitionBound(PartitionBoundSpec partitionBound) {
        if (partitionBound.IsDefault) {
            return new SqlNode("PartitionBound", 0, 0, null, BuildProps(("isDefault", true)));
        }
        var lowerDatums = partitionBound.Lowerdatums.Select(BuildPartitionDatum).OfType<string>().ToList();
        var upperDatums = partitionBound.Upperdatums.Select(BuildPartitionDatum).OfType<string>().ToList();
        var listDatums  = partitionBound.Listdatums.Select(n => {
            if (n.NodeCase == Node.NodeOneofCase.AConst) {
                var v = BuildAConst(n.AConst);
                return v.Text;
            }
            return null;
        }).OfType<string>().ToList();

        return new SqlNode("PartitionBound", 0, 0, null, BuildProps(
            ("lower",      MaybeList(lowerDatums)),
            ("upper",      MaybeList(upperDatums)),
            ("listDatums", MaybeList(listDatums)),
            ("modulus",    partitionBound.Modulus > 0 ? (object?)partitionBound.Modulus   : null),
            ("remainder",  partitionBound.Modulus > 0 ? (object?)partitionBound.Remainder : null)
        ));
    }

    private static string? BuildPartitionDatum(Node n) {
        if (n.NodeCase == Node.NodeOneofCase.AConst) {
            var v = BuildAConst(n.AConst);
            return v.Text;
        }
        if (n.NodeCase == Node.NodeOneofCase.ColumnRef && n.ColumnRef.Fields.Count > 0) {
            var name = n.ColumnRef.Fields[0].NodeCase == Node.NodeOneofCase.String
                ? n.ColumnRef.Fields[0].String.Sval
                : "";
            return name.ToUpper();
        }
        return null;
    }

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

    private SqlNode BuildCreateFunction(CreateFunctionStmt s, int start, int end) {
        string? language = null;
        string? body = null;
        foreach (var o in s.Options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            switch (defElem.Defname) {
                case "language":
                    if (defElem.Arg?.NodeCase == Node.NodeOneofCase.String)
                        language = defElem.Arg.String.Sval;
                    break;
                case "as":
                    // AS body is a List with one String item (dollar-quoted body contents)
                    if (defElem.Arg?.NodeCase == Node.NodeOneofCase.List && defElem.Arg.List.Items.Count > 0
                        && defElem.Arg.List.Items[0].NodeCase == Node.NodeOneofCase.String)
                        body = defElem.Arg.List.Items[0].String.Sval;
                    break;
            }
        }
        // RETURNS TABLE params have FuncParamTable mode; separate them from regular params
        var tableParams = s.Parameters
            .Where(n => n.NodeCase == Node.NodeOneofCase.FunctionParameter &&
                        n.FunctionParameter.Mode == FunctionParameterMode.FuncParamTable)
            .Select(n => BuildFunctionParam(n)).OfType<SqlNode>().ToList();
        var regularParams = s.Parameters
            .Where(n => n.NodeCase != Node.NodeOneofCase.FunctionParameter ||
                        n.FunctionParameter.Mode != FunctionParameterMode.FuncParamTable);
        return new SqlNode("CreateFunctionStatement", start, end, null, BuildProps(
            ("name",         s.Funcname.Count > 0 ? string.Join(".", s.Funcname.Select(n => n.String.Sval)) : null),
            ("parameters",   MapList(regularParams, BuildFunctionParam)),
            ("returnType",   tableParams.Count == 0 && s.ReturnType != null ? BuildPgTypeName(s.ReturnType) : null),
            ("returnsTable", MaybeList(tableParams)),
            ("language",     language),
            ("body",         body)
        ));
    }

    private SqlNode BuildCreateIndex(IndexStmt s, int start, int end) =>
        new("CreateIndexStatement", start, end, null, BuildProps(
            ("indexName",    s.Idxname),
            ("relation",     BuildRangeVar(s.Relation)),
            ("columns",      MapList(s.IndexParams, BuildIndexElem)),
            ("including",    MapList(s.IndexIncludingParams, BuildIndexElem)),
            ("unique",       s.Unique       ? true : null),
            ("concurrent",   s.Concurrent   ? true : null),
            ("ifNotExists",  s.IfNotExists  ? true : null),
            ("accessMethod", string.IsNullOrEmpty(s.AccessMethod) || s.AccessMethod == "btree" ? null : s.AccessMethod),
            ("where",        BuildExpr(s.WhereClause))
        ));

    private static SqlNode BuildDrop(DropStmt s, int start, int end) {
        var objectType = ObjectTypeKw(s.RemoveType);
        var names = s.Objects.Select(o => o.NodeCase switch {
            Node.NodeOneofCase.List => string.Join(".", o.List.Items
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval)),
            Node.NodeOneofCase.ObjectWithArgs => OwaName(o.ObjectWithArgs.Objname),
            Node.NodeOneofCase.TypeName => string.Join(".", o.TypeName.Names
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval)
                .Where(v => v != "pg_catalog")),
            Node.NodeOneofCase.String => o.String.Sval,
            _ => null,
        }).OfType<string>().Where(n => !string.IsNullOrEmpty(n)).ToList();
        return new SqlNode("DropStatement", start, end, null, BuildProps(
            ("objectType", objectType),
            ("names",      MaybeList(names)),
            ("ifExists",   s.MissingOk ? true : null),
            ("cascade",    s.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

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
            Node.NodeOneofCase.AIndirection => BuildIndirection(node.AIndirection),
            Node.NodeOneofCase.NamedArgExpr => BuildNamedArgExpr(node.NamedArgExpr),
            Node.NodeOneofCase.GroupingSet  => BuildGroupingSet(node.GroupingSet),
            Node.NodeOneofCase.GroupingFunc => BuildGroupingFunc(node.GroupingFunc),
            Node.NodeOneofCase.Constraint   => BuildConstraint(node.Constraint),
            Node.NodeOneofCase.MergeWhenClause => BuildMergeWhen(node.MergeWhenClause),
            Node.NodeOneofCase.XmlExpr      => BuildXmlExpr(node.XmlExpr),
            Node.NodeOneofCase.JsonFuncExpr => BuildJsonFuncExpr(node.JsonFuncExpr),
            _ => new SqlNode("RawExpr", 0, 0, node.NodeCase.ToString(), null),
        };
    }

    // libpg_query wraps the SIMILAR TO pattern in similar_to_escape(pattern, NULL);
    // extract the first argument so the formatter emits the bare literal.
    private SqlNode? UnwrapSimilarToEscape(Node? node) {
        if (node?.NodeCase == Node.NodeOneofCase.FuncCall) {
            var fc = node.FuncCall;
            var fname = fc.Funcname.LastOrDefault()?.String?.Sval;
            if (fname == "similar_to_escape" && fc.Args.Count > 0)
                return BuildExpr(fc.Args[0]);
        }
        return BuildExpr(node);
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

            // SIMILAR TO — libpg_query wraps the RHS in similar_to_escape(); unwrap it
            A_Expr_Kind.AexprSimilar => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",    op == "!~" ? "NOT SIMILAR TO" : "SIMILAR TO"),
                ("left",  BuildExpr(e.Lexpr)),
                ("right", UnwrapSimilarToEscape(e.Rexpr))
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
            ("args", MaybeList(args))
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
            // Named window reference: OVER w — Name is set but no partition/order/frame
            ("over",     f.Over != null
                ? (!string.IsNullOrEmpty(f.Over.Name) && f.Over.PartitionClause.Count == 0
                    && f.Over.OrderClause.Count == 0 && (f.Over.FrameOptions & 0x00001) == 0
                    ? new SqlNode("WindowRef", 0, 0, f.Over.Name, null)
                    : BuildWindowDef(f.Over))
                : null)
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
            ("name",         string.IsNullOrEmpty(w.Name)    ? null : w.Name),
            ("refname",      string.IsNullOrEmpty(w.Refname) ? null : w.Refname),
            ("partitionBy",  MapList(w.PartitionClause, BuildExpr)),
            ("orderBy",      MapList(w.OrderClause, BuildExpr)),
            ("frameMode",    frameMode),
            ("frameStart",   frameStart),
            ("startOffset",  w.StartOffset != null ? BuildExpr(w.StartOffset) : null),
            ("frameEnd",     frameEnd),
            ("endOffset",    w.EndOffset != null ? BuildExpr(w.EndOffset) : null)
        ));
    }

    private SqlNode BuildTypeCast(TypeCast t) {
        var typeName = t.TypeName != null ? BuildPgTypeName(t.TypeName) : null;
        var arg      = BuildExpr(t.Arg);

        // INTERVAL 'value' or INTERVAL 'value' field_modifier
        if (typeName != null && typeName.StartsWith("interval")) {
            // typeName may be "interval" or "interval YEAR TO MONTH" etc.
            var field = typeName == "interval" ? null : typeName.Substring("interval ".Length);
            return new SqlNode("IntervalLiteral", 0, 0, null, BuildProps(
                ("value", arg),
                ("field", field)
            ));
        }

        // All other type casts: emit Cast node (printer renders as expr::type)
        return new SqlNode("Cast", 0, 0, null, BuildProps(
            ("arg",      arg),
            ("typeName", typeName)
        ));
    }

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
        var testexpr = s.Testexpr != null ? BuildExpr(s.Testexpr) : null;
        var op = s.OperName.Count > 0 && s.OperName[0].NodeCase == Node.NodeOneofCase.String
            ? s.OperName[0].String.Sval : null;
        return new SqlNode("SubLink", 0, 0, null, BuildProps(
            ("type",     type),
            ("testexpr", testexpr),
            ("op",       op),
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
        Node.NodeOneofCase.RangeTableSample => BuildRangeTableSample(n.RangeTableSample),
        _ => new SqlNode("RawFrom", 0, 0, n.NodeCase.ToString(), null),
    };

    private SqlNode BuildRangeTableSample(RangeTableSample r) {
        var relation = r.Relation != null ? BuildFromItem(r.Relation) : null;
        var method = r.Method.Count > 0 && r.Method[0].NodeCase == Node.NodeOneofCase.String
            ? r.Method[0].String.Sval
            : null;
        return new SqlNode("RangeTableSample", 0, 0, null, BuildProps(
            ("relation",   relation),
            ("method",     method),
            ("args",       MapList(r.Args, BuildExpr)),
            ("repeatable", r.Repeatable != null ? BuildExpr(r.Repeatable) : null)
        ));
    }

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
            ("using",    j.UsingClause.Count > 0
                ? (object?)j.UsingClause
                    .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                    .Select(n => n.String.Sval).ToList()
                : null)
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

            SqlNode? search = null;
            if (cte.SearchClause != null) {
                var sc = cte.SearchClause;
                var cols = sc.SearchColList
                    .Select(c => c.NodeCase == Node.NodeOneofCase.String ? c.String.Sval
                        : c.NodeCase == Node.NodeOneofCase.ColumnRef && c.ColumnRef.Fields.Count > 0
                            && c.ColumnRef.Fields[0].NodeCase == Node.NodeOneofCase.String
                            ? c.ColumnRef.Fields[0].String.Sval : null)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .Cast<string>()
                    .ToList();
                search = new SqlNode("CTESearch", 0, 0, null, BuildProps(
                    ("breadthFirst", sc.SearchBreadthFirst ? true : null),
                    ("columns",      MaybeList(cols)),
                    ("seqColumn",    string.IsNullOrEmpty(sc.SearchSeqColumn) ? null : sc.SearchSeqColumn)
                ));
            }

            SqlNode? cycle = null;
            if (cte.CycleClause != null) {
                var cc = cte.CycleClause;
                var cols = cc.CycleColList
                    .Select(c => c.NodeCase == Node.NodeOneofCase.String ? c.String.Sval
                        : c.NodeCase == Node.NodeOneofCase.ColumnRef && c.ColumnRef.Fields.Count > 0
                            && c.ColumnRef.Fields[0].NodeCase == Node.NodeOneofCase.String
                            ? c.ColumnRef.Fields[0].String.Sval : null)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .Cast<string>()
                    .ToList();
                cycle = new SqlNode("CTECycle", 0, 0, null, BuildProps(
                    ("columns",    MaybeList(cols)),
                    ("markColumn", string.IsNullOrEmpty(cc.CycleMarkColumn) ? null : cc.CycleMarkColumn),
                    ("pathColumn", string.IsNullOrEmpty(cc.CyclePathColumn) ? null : cc.CyclePathColumn)
                ));
            }

            return new SqlNode("CTE", 0, 0, null, BuildProps(
                ("name",   cte.Ctename),
                ("query",  query),
                ("search", search),
                ("cycle",  cycle)
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
        Node.NodeOneofCase.TableLikeClause => BuildTableLikeClause(n.TableLikeClause),
        _ => null,
    };

    private static SqlNode BuildTableLikeClause(TableLikeClause t) {
        var options = (int)t.Options;
        List<string> including;
        if (options == 0) {
            including = new List<string>();
        } else if (options > 0x01FF) {
            including = new List<string> { "ALL" };
        } else {
            including = new List<string>();
            if ((options & 0x0001) != 0) including.Add("COMMENTS");
            if ((options & 0x0004) != 0) including.Add("CONSTRAINTS");
            if ((options & 0x0008) != 0) including.Add("DEFAULTS");
            if ((options & 0x0010) != 0) including.Add("GENERATED");
            if ((options & 0x0020) != 0) including.Add("IDENTITY");
            if ((options & 0x0040) != 0) including.Add("INDEXES");
            if ((options & 0x0080) != 0) including.Add("STATISTICS");
            if ((options & 0x0100) != 0) including.Add("STORAGE");
        }
        return new SqlNode("TableLikeClause", 0, 0, null, BuildProps(
            ("relation",  BuildRangeVar(t.Relation)),
            ("including", MaybeList(including))
        ));
    }

    private SqlNode BuildColumnDef(ColumnDef columnDef) =>
        new("ColumnDef", 0, 0, null, BuildProps(
            ("name",        columnDef.Colname),
            ("typeName",    columnDef.TypeName != null ? BuildPgTypeName(columnDef.TypeName) : null),
            ("constraints", columnDef.Constraints.Count > 0
                ? (object?)columnDef.Constraints
                    .Where(n => n.NodeCase == Node.NodeOneofCase.Constraint)
                    .Select(n => BuildConstraint(n.Constraint))
                    .ToList()
                : null)
        ));

    private SqlNode BuildConstraint(Constraint constraint) {
        var contype = constraint.Contype switch {
            ConstrType.ConstrNull              => "NULL",
            ConstrType.ConstrNotnull           => "NOT NULL",
            ConstrType.ConstrDefault           => "DEFAULT",
            ConstrType.ConstrIdentity          => "IDENTITY",
            ConstrType.ConstrGenerated         => "GENERATED",
            ConstrType.ConstrCheck             => "CHECK",
            ConstrType.ConstrPrimary           => "PRIMARY KEY",
            ConstrType.ConstrUnique            => "UNIQUE",
            ConstrType.ConstrForeign           => "FOREIGN KEY",
            ConstrType.ConstrExclusion         => "EXCLUDE",
            ConstrType.ConstrAttrDeferrable    => "DEFERRABLE",
            ConstrType.ConstrAttrNotDeferrable => "NOT DEFERRABLE",
            ConstrType.ConstrAttrDeferred      => "INITIALLY DEFERRED",
            ConstrType.ConstrAttrImmediate     => "INITIALLY IMMEDIATE",
            _                                  => constraint.Contype.ToString(),
        };

        // FK actions: 'a'=NO ACTION, 'r'=RESTRICT, 'c'=CASCADE, 'n'=SET NULL, 'd'=SET DEFAULT
        string FkAction(string ch) => ch switch {
            "r" => "RESTRICT",
            "c" => "CASCADE",
            "n" => "SET NULL",
            "d" => "SET DEFAULT",
            _   => "NO ACTION",
        };

        // Keys list (PRIMARY KEY / UNIQUE column list at table level)
        var keys = constraint.Keys.Count > 0
            ? (object?)constraint.Keys.Select(k => k.NodeCase == Node.NodeOneofCase.String ? k.String.Sval : "").ToList()
            : null;

        // FK columns
        var fkAttrs = constraint.FkAttrs.Count > 0
            ? (object?)constraint.FkAttrs.Select(k => k.String.Sval).ToList()
            : null;
        var pkAttrs = constraint.PkAttrs.Count > 0
            ? (object?)constraint.PkAttrs.Select(k => k.String.Sval).ToList()
            : null;

        return new SqlNode("Constraint", 0, 0, null, BuildProps(
            ("contype",          contype),
            ("name",             string.IsNullOrEmpty(constraint.Conname) ? null : constraint.Conname),
            ("expr",             constraint.RawExpr != null ? BuildExpr(constraint.RawExpr) : null),
            ("keys",             keys),
            ("nullsNotDistinct", constraint.NullsNotDistinct ? true : null),
            ("pktable",          constraint.Pktable != null ? BuildRangeVar(constraint.Pktable) : null),
            ("fkAttrs",          fkAttrs),
            ("pkAttrs",          pkAttrs),
            ("fkUpdAction",      string.IsNullOrEmpty(constraint.FkUpdAction) || constraint.FkUpdAction == "a" ? null : FkAction(constraint.FkUpdAction)),
            ("fkDelAction",      string.IsNullOrEmpty(constraint.FkDelAction) || constraint.FkDelAction == "a" ? null : FkAction(constraint.FkDelAction)),
            ("generatedWhen",    string.IsNullOrEmpty(constraint.GeneratedWhen) ? null : (constraint.GeneratedWhen == "a" ? "ALWAYS" : "BY DEFAULT")),
            ("deferrable",       constraint.Deferrable ? true : null),
            ("initDeferred",     constraint.Initdeferred ? true : null)
        ));
    }

    private SqlNode? BuildAlterCmd(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.AlterTableCmd) return null;
        return BuildAlterCmd(n.AlterTableCmd);
    }

    private SqlNode BuildAlterCmd(AlterTableCmd cmd) {
        var subtype = cmd.Subtype switch {
            AlterTableType.AtAddColumn       => "ADD COLUMN",
            AlterTableType.AtDropColumn      => "DROP COLUMN",
            AlterTableType.AtAddConstraint   => "ADD CONSTRAINT",
            AlterTableType.AtDropConstraint  => "DROP CONSTRAINT",
            AlterTableType.AtAlterColumnType => "ALTER COLUMN TYPE",
            AlterTableType.AtColumnDefault   => cmd.Def != null ? "SET DEFAULT" : "DROP DEFAULT",
            AlterTableType.AtSetNotNull      => "SET NOT NULL",
            AlterTableType.AtDropNotNull     => "DROP NOT NULL",
            _ => cmd.Subtype.ToString().Replace("At", ""),
        };
        string? newType = null;
        if (cmd.Subtype == AlterTableType.AtAlterColumnType && cmd.Def?.NodeCase == Node.NodeOneofCase.ColumnDef
            && cmd.Def.ColumnDef.TypeName != null)
            newType = BuildPgTypeName(cmd.Def.ColumnDef.TypeName);

        return new SqlNode("AlterCmd", 0, 0, null, BuildProps(
            ("subtype", subtype),
            ("name",    string.IsNullOrEmpty(cmd.Name) ? null : cmd.Name),
            ("newType", newType),
            ("expr",    cmd.Subtype == AlterTableType.AtColumnDefault && cmd.Def != null ? BuildExpr(cmd.Def) : null),
            ("def",     cmd.Subtype == AlterTableType.AtAddColumn && cmd.Def?.NodeCase == Node.NodeOneofCase.ColumnDef
                        ? BuildColumnDef(cmd.Def.ColumnDef)
                        : cmd.Subtype == AlterTableType.AtAddConstraint && cmd.Def?.NodeCase == Node.NodeOneofCase.Constraint
                        ? BuildConstraint(cmd.Def.Constraint)
                        : null),
            ("ifExists", cmd.MissingOk ? true : null)
        ));
    }

    private static SqlNode? BuildFunctionParam(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.FunctionParameter) return null;
        var p = n.FunctionParameter;
        var mode = p.Mode switch {
            FunctionParameterMode.FuncParamOut      => "OUT",
            FunctionParameterMode.FuncParamInout    => "INOUT",
            FunctionParameterMode.FuncParamVariadic => "VARIADIC",
            _                                        => null,
        };
        return new SqlNode("FunctionParam", 0, 0, null, BuildProps(
            ("name",     p.Name),
            ("typeName", p.ArgType != null ? BuildPgTypeName(p.ArgType) : null),
            ("mode",     mode)
        ));
    }

    private SqlNode? BuildIndexElem(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.IndexElem) return null;
        var ie = n.IndexElem;
        var dir = ie.Ordering switch {
            SortByDir.SortbyDesc => "DESC",
            SortByDir.SortbyAsc  => "ASC",
            _ => null,
        };
        // expr is set for expression indexes (e.g. lower(email)); name for simple column refs
        SqlNode? expr = ie.Expr != null ? BuildExpr(ie.Expr) : null;
        return new SqlNode("IndexElem", 0, 0, null, BuildProps(
            ("name", string.IsNullOrEmpty(ie.Name) ? null : ie.Name),
            ("expr", expr),
            ("direction", dir)
        ));
    }

    // pg_catalog internal names → user-visible SQL standard names
    private static readonly Dictionary<string, string> _typeAliases = new() {
        ["int2"]   = "smallint",
        ["int4"]   = "integer",
        ["int8"]   = "bigint",
        ["float4"] = "real",
        ["float8"] = "double precision",
        ["bool"]   = "boolean",
    };

    // INTERVAL typmod bitmask → SQL standard field name (actual pgsqlparser values)
    private static readonly Dictionary<int, string> _intervalMasks = new() {
        [4]    = "YEAR",
        [2]    = "MONTH",
        [6]    = "YEAR TO MONTH",
        [8]    = "DAY",
        [1024] = "HOUR",
        [2048] = "MINUTE",
        [4096] = "SECOND",
        [1032] = "DAY TO HOUR",
        [3080] = "DAY TO MINUTE",
        [7176] = "DAY TO SECOND",
        [3072] = "HOUR TO MINUTE",
        [7168] = "HOUR TO SECOND",
        [6144] = "MINUTE TO SECOND",
    };

    private static string BuildPgTypeName(TypeName t) {
        var raw = string.Join(".", t.Names.Select(n => n.String.Sval).Where(s => s != "pg_catalog"));
        var name = _typeAliases.TryGetValue(raw, out var alias) ? alias : raw;

        // Special handling for INTERVAL: typmods encode the field range as a bitmask
        if (raw == "interval" && t.Typmods.Count > 0) {
            var firstMod = t.Typmods[0];
            int mask = firstMod.NodeCase switch {
                Node.NodeOneofCase.Integer => firstMod.Integer.Ival,
                Node.NodeOneofCase.AConst when firstMod.AConst.ValCase == A_Const.ValOneofCase.Ival => firstMod.AConst.Ival.Ival,
                _ => 0,
            };
            if (mask > 0 && _intervalMasks.TryGetValue(mask, out var fieldName)) {
                name = $"interval {fieldName}";
            }
            // Optional precision is second typmod
            if (t.Typmods.Count > 1) {
                var precMod = t.Typmods[1];
                string? prec = precMod.NodeCase switch {
                    Node.NodeOneofCase.Integer => precMod.Integer.Ival.ToString(),
                    Node.NodeOneofCase.AConst when precMod.AConst.ValCase == A_Const.ValOneofCase.Ival => precMod.AConst.Ival.Ival.ToString(),
                    _ => null,
                };
                if (prec != null) name += $"({prec})";
            }
            if (t.ArrayBounds.Count > 0) name += "[]";
            return name;
        }

        if (t.Typmods.Count > 0) {
            var mods = t.Typmods
                .Select(m => m.NodeCase switch {
                    Node.NodeOneofCase.Integer => m.Integer.Ival.ToString(),
                    Node.NodeOneofCase.AConst when m.AConst.ValCase == A_Const.ValOneofCase.Ival => m.AConst.Ival.Ival.ToString(),
                    Node.NodeOneofCase.AConst when m.AConst.ValCase == A_Const.ValOneofCase.Fval => m.AConst.Fval.Fval,
                    _ => null,
                })
                .OfType<string>()
                .ToList();
            if (mods.Count > 0) name += $"({string.Join(", ", mods)})";
        }

        if (t.ArrayBounds.Count > 0) name += "[]";

        return name;
    }

    private SqlNode BuildIndirection(A_Indirection a) {
        var subscripts = a.Indirection
            .Select(n => {
                if (n.NodeCase == Node.NodeOneofCase.AIndices) {
                    var idx = n.AIndices;
                    return !idx.IsSlice
                        ? new SqlNode("SubscriptIndex", 0, 0, null, BuildProps(
                              ("index", BuildExpr(idx.Uidx))))
                        : new SqlNode("SubscriptSlice", 0, 0, null, BuildProps(
                              ("lower", idx.Lidx?.NodeCase != Node.NodeOneofCase.None ? BuildExpr(idx.Lidx) : null),
                              ("upper", idx.Uidx?.NodeCase != Node.NodeOneofCase.None ? BuildExpr(idx.Uidx) : null)));
                }
                if (n.NodeCase == Node.NodeOneofCase.String)
                    return new SqlNode("FieldAccess", 0, 0, n.String.Sval, null);
                return null;
            })
            .OfType<SqlNode>()
            .ToList();
        return new SqlNode("Subscript", 0, 0, null, BuildProps(
            ("arg",        BuildExpr(a.Arg)),
            ("subscripts", MaybeList(subscripts))
        ));
    }

    private SqlNode BuildNamedArgExpr(NamedArgExpr n) =>
        new("NamedArg", 0, 0, null, BuildProps(
            ("name", n.Name),
            ("arg",  BuildExpr(n.Arg))
        ));

    private SqlNode BuildGroupingSet(GroupingSet g) {
        var kind = g.Kind switch {
            GroupingSetKind.GroupingSetRollup => "ROLLUP",
            GroupingSetKind.GroupingSetCube   => "CUBE",
            GroupingSetKind.GroupingSetSets   => "SETS",
            GroupingSetKind.GroupingSetEmpty  => "EMPTY",
            GroupingSetKind.GroupingSetSimple => "SIMPLE",
            _                                 => g.Kind.ToString(),
        };
        return new SqlNode("GroupingSet", 0, 0, null, BuildProps(
            ("kind",    kind),
            ("content", MapList(g.Content, BuildExpr))
        ));
    }

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
            ("relations",   MaybeList(relations)),
            ("restartSeqs", s.RestartSeqs ? true : null),
            ("cascade",     s.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

    private static SqlNode BuildTransaction(TransactionStmt t, int start, int end) {
        var kind = t.Kind switch {
            TransactionStmtKind.TransStmtBegin            => "BEGIN",
            TransactionStmtKind.TransStmtStart            => "START TRANSACTION",
            TransactionStmtKind.TransStmtCommit           => "COMMIT",
            TransactionStmtKind.TransStmtRollback         => "ROLLBACK",
            TransactionStmtKind.TransStmtSavepoint        => "SAVEPOINT",
            TransactionStmtKind.TransStmtRelease          => "RELEASE",
            TransactionStmtKind.TransStmtRollbackTo       => "ROLLBACK TO",
            TransactionStmtKind.TransStmtPrepare          => "PREPARE TRANSACTION",
            TransactionStmtKind.TransStmtCommitPrepared   => "COMMIT PREPARED",
            TransactionStmtKind.TransStmtRollbackPrepared => "ROLLBACK PREPARED",
            _                                             => t.Kind.ToString(),
        };

        // Parse transaction mode options (isolation level, read only, deferrable)
        var options = new List<string>();
        foreach (var n in t.Options) {
            if (n.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = n.DefElem;
            switch (defElem.Defname) {
                case "transaction_isolation": {
                    string? isoLevel = defElem.Arg?.NodeCase == Node.NodeOneofCase.String
                        ? defElem.Arg.String.Sval
                        : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval
                            ? defElem.Arg.AConst.Sval.Sval
                            : null;
                    if (isoLevel != null) options.Add($"ISOLATION LEVEL {isoLevel.ToUpper()}");
                    break;
                }
                case "transaction_read_only": {
                    bool readOnly = defElem.Arg?.NodeCase == Node.NodeOneofCase.Integer
                        ? defElem.Arg.Integer.Ival == 1
                        : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival
                            && defElem.Arg.AConst.Ival.Ival == 1;
                    options.Add(readOnly ? "READ ONLY" : "READ WRITE");
                    break;
                }
                case "transaction_deferrable": {
                    bool deferrable = defElem.Arg?.NodeCase == Node.NodeOneofCase.Integer
                        ? defElem.Arg.Integer.Ival == 1
                        : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival
                            && defElem.Arg.AConst.Ival.Ival == 1;
                    options.Add(deferrable ? "DEFERRABLE" : "NOT DEFERRABLE");
                    break;
                }
            }
        }

        return new SqlNode("TransactionStatement", start, end, null, BuildProps(
            ("kind",      kind),
            ("savepoint", string.IsNullOrEmpty(t.SavepointName) ? null : t.SavepointName),
            ("gid",       string.IsNullOrEmpty(t.Gid) ? null : t.Gid),
            ("options",   MaybeList(options))
        ));
    }

    private SqlNode BuildVariableSet(VariableSetStmt v, int start, int end) {
        if (v.Kind == VariableSetKind.VarSetMulti && v.Name == "TRANSACTION") {
            var txOpts = new List<string>();
            foreach (var n in v.Args) {
                if (n.NodeCase != Node.NodeOneofCase.DefElem) continue;
                var defElem = n.DefElem;
                switch (defElem.Defname) {
                    case "transaction_isolation": {
                        string? iso = defElem.Arg?.NodeCase == Node.NodeOneofCase.String ? defElem.Arg.String.Sval
                            : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval
                                ? defElem.Arg.AConst.Sval.Sval : null;
                        if (iso != null) txOpts.Add($"ISOLATION LEVEL {iso.ToUpper()}");
                        break;
                    }
                    case "transaction_read_only":
                        txOpts.Add(GetBoolFromArg(defElem.Arg) ? "READ ONLY" : "READ WRITE");
                        break;
                    case "transaction_deferrable":
                        txOpts.Add(GetBoolFromArg(defElem.Arg) ? "DEFERRABLE" : "NOT DEFERRABLE");
                        break;
                }
            }
            return new SqlNode("TransactionStatement", start, end, null, BuildProps(
                ("kind", "SET TRANSACTION"), ("options", MaybeList(txOpts))));
        }
        if (v.Kind == VariableSetKind.VarSetValue) {
            var vals = v.Args.Select(a =>
                a.NodeCase == Node.NodeOneofCase.AConst && a.AConst.ValCase == A_Const.ValOneofCase.Sval
                    ? a.AConst.Sval.Sval
                    : a.NodeCase == Node.NodeOneofCase.TypeCast
                        ? a.TypeCast.Arg?.AConst?.Sval?.Sval
                        : null
            ).OfType<string>().ToList();
            return new SqlNode("VariableSetStatement", start, end, null, BuildProps(
                ("kind", "SET"), ("name", v.Name),
                ("values", MaybeList(vals)),
                ("local", v.IsLocal ? true : null)));
        }
        if (v.Kind == VariableSetKind.VarSetDefault)
            return new SqlNode("VariableSetStatement", start, end, null, BuildProps(
                ("kind", "SET DEFAULT"), ("name", v.Name), ("local", v.IsLocal ? true : null)));
        if (v.Kind == VariableSetKind.VarReset)
            return new SqlNode("VariableSetStatement", start, end, null, BuildProps(
                ("kind", "RESET"), ("name", v.Name)));
        if (v.Kind == VariableSetKind.VarResetAll)
            return new SqlNode("VariableSetStatement", start, end, null, BuildProps(("kind", "RESET ALL")));
        return Fallback(start, end);
    }

    private static SqlNode BuildVariableShow(VariableShowStmt v, int start, int end) =>
        new("VariableShowStatement", start, end, null, BuildProps(("name", v.Name)));

    private SqlNode BuildGrant(GrantStmt g, int start, int end) {
        var privs = g.Privileges
            .Select(p => p.NodeCase == Node.NodeOneofCase.AccessPriv
                ? (string.IsNullOrEmpty(p.AccessPriv.PrivName) ? "ALL PRIVILEGES" : p.AccessPriv.PrivName.ToUpper())
                : null)
            .OfType<string>().ToList();

        var objtypeStr = g.Objtype switch {
            ObjectType.ObjectTable    => g.Targtype == GrantTargetType.AclTargetAllInSchema ? "ALL TABLES IN SCHEMA" : "TABLE",
            ObjectType.ObjectSequence => g.Targtype == GrantTargetType.AclTargetAllInSchema ? "ALL SEQUENCES IN SCHEMA" : "SEQUENCE",
            ObjectType.ObjectFunction => g.Targtype == GrantTargetType.AclTargetAllInSchema ? "ALL FUNCTIONS IN SCHEMA" : "FUNCTION",
            ObjectType.ObjectRoutine  => g.Targtype == GrantTargetType.AclTargetAllInSchema ? "ALL ROUTINES IN SCHEMA" : "ROUTINE",
            ObjectType.ObjectSchema   => "SCHEMA",
            ObjectType.ObjectDatabase => "DATABASE",
            ObjectType.ObjectType     => "TYPE",
            ObjectType.ObjectLanguage => "LANGUAGE",
            ObjectType.ObjectTablespace => "TABLESPACE",
            _ => g.Objtype.ToString().Replace("Object", "").ToUpper(),
        };

        var objects = g.Objects.Select(o => o.NodeCase switch {
            Node.NodeOneofCase.RangeVar       => BuildRangeVar(o.RangeVar),
            Node.NodeOneofCase.String         => new SqlNode("Literal", 0, 0, o.String.Sval, null),
            Node.NodeOneofCase.ObjectWithArgs => new SqlNode("Literal", 0, 0,
                OwaName(o.ObjectWithArgs.Objname), null),
            _ => null,
        }).OfType<SqlNode>().ToList();

        var grantees = g.Grantees.Select(gr => gr.NodeCase == Node.NodeOneofCase.RoleSpec
            ? (gr.RoleSpec.Roletype == RoleSpecType.RolespecPublic ? "PUBLIC" : gr.RoleSpec.Rolename)
            : null).OfType<string>().ToList();

        return new SqlNode(g.IsGrant ? "GrantStatement" : "RevokeStatement", start, end, null, BuildProps(
            ("privs",       MaybeList(privs)),
            ("objtype",     objtypeStr),
            ("objects",     MaybeList(objects)),
            ("grantees",    MaybeList(grantees)),
            ("grantOption", g.GrantOption ? true : null),
            ("cascade",     g.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

    private static SqlNode BuildCreateRole(CreateRoleStmt c, int start, int end) {
        var stmtType = c.StmtType switch {
            RoleStmtType.RolestmtUser  => "USER",
            RoleStmtType.RolestmtGroup => "GROUP",
            _                          => "ROLE",
        };
        return new SqlNode("CreateRoleStatement", start, end, null, BuildProps(
            ("stmtType", stmtType),
            ("name",     c.Role),
            ("options",  ParseRoleOptions(c.Options) is { Count: > 0 } options ? (object?)options : null)
        ));
    }

    private static SqlNode BuildAlterRole(AlterRoleStmt ar, int start, int end) =>
        new("AlterRoleStatement", start, end, null, BuildProps(
            ("name",    ar.Role?.Rolename ?? ""),
            ("options", ParseRoleOptions(ar.Options) is { Count: > 0 } options ? (object?)options : null)
        ));

    private static List<string> ParseRoleOptions(Google.Protobuf.Collections.RepeatedField<Node> options) {
        var result = new List<string>();
        foreach (var o in options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            bool flag = GetBoolFromArg(defElem.Arg);
            switch (defElem.Defname) {
                case "superuser":     result.Add(flag ? "SUPERUSER" : "NOSUPERUSER"); break;
                case "createdb":      result.Add(flag ? "CREATEDB" : "NOCREATEDB"); break;
                case "createrole":    result.Add(flag ? "CREATEROLE" : "NOCREATEROLE"); break;
                case "inherit":       result.Add(flag ? "INHERIT" : "NOINHERIT"); break;
                case "canlogin":      result.Add(flag ? "LOGIN" : "NOLOGIN"); break;
                case "isreplication": result.Add(flag ? "REPLICATION" : "NOREPLICATION"); break;
                case "bypassrls":     result.Add(flag ? "BYPASSRLS" : "NOBYPASSRLS"); break;
                case "password":
                    var pwd = defElem.Arg?.NodeCase == Node.NodeOneofCase.String ? defElem.Arg.String.Sval
                        : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval
                            ? defElem.Arg.AConst.Sval.Sval : null;
                    result.Add(pwd != null ? $"PASSWORD '{pwd}'" : "PASSWORD NULL");
                    break;
                case "connectionlimit":
                    result.Add($"CONNECTION LIMIT {defElem.Arg?.Integer?.Ival ?? -1}");
                    break;
            }
        }
        return result;
    }

    private SqlNode BuildRename(RenameStmt r, int start, int end) {
        var renameType = r.RenameType switch {
            ObjectType.ObjectColumn   => "RENAME COLUMN",
            ObjectType.ObjectTable    => "RENAME TABLE",
            ObjectType.ObjectIndex    => "RENAME INDEX",
            ObjectType.ObjectSchema   => "RENAME SCHEMA",
            ObjectType.ObjectView     => "RENAME VIEW",
            ObjectType.ObjectMatview  => "RENAME MATERIALIZED VIEW",
            ObjectType.ObjectSequence => "RENAME SEQUENCE",
            ObjectType.ObjectType     => "RENAME TYPE",
            ObjectType.ObjectFunction => "RENAME FUNCTION",
            ObjectType.ObjectProcedure => "RENAME PROCEDURE",
            ObjectType.ObjectTrigger  => "RENAME TRIGGER",
            _                         => "RENAME",
        };
        // For function/procedure rename, extract name + arg types from ObjectWithArgs
        string? objName = null;
        List<string>? objArgTypes = null;
        if (r.Object != null && r.Object.NodeCase == Node.NodeOneofCase.ObjectWithArgs) {
            var owa = r.Object.ObjectWithArgs;
            objName = OwaName(owa.Objname);
            if (!owa.ArgsUnspecified && owa.Objargs.Count > 0)
                objArgTypes = owa.Objargs
                    .Select(n => n.NodeCase == Node.NodeOneofCase.TypeName ? BuildPgTypeName(n.TypeName) : null)
                    .OfType<string>().ToList();
        }
        return new SqlNode("RenameStatement", start, end, null, BuildProps(
            ("renameType",  renameType),
            ("relation",    r.Relation != null ? BuildRangeVar(r.Relation) : null),
            ("objName",     objName),
            ("objArgTypes", objArgTypes != null ? MaybeList(objArgTypes) : null),
            ("oldName",     string.IsNullOrEmpty(r.Subname) ? null : r.Subname),
            ("newName",     r.Newname)
        ));
    }

    private SqlNode BuildCreateCompositeType(CompositeTypeStmt ct, int start, int end) =>
        new("CreateTypeStatement", start, end, null, BuildProps(
            ("kind",     "COMPOSITE"),
            ("typeName", ct.Typevar?.Relname),
            ("columns",  ct.Coldeflist.Count > 0
                ? (object?)ct.Coldeflist
                    .Where(n => n.NodeCase == Node.NodeOneofCase.ColumnDef)
                    .Select(n => BuildColumnDef(n.ColumnDef))
                    .ToList()
                : null)
        ));

    private static SqlNode BuildCreateEnumType(CreateEnumStmt ce, int start, int end) {
        var typeName = string.Join(".", ce.TypeName.Select(n => n.String.Sval));
        var vals = ce.Vals.Select(n => n.String?.Sval).OfType<string>().ToList();
        return new SqlNode("CreateTypeStatement", start, end, null, BuildProps(
            ("kind",     "ENUM"),
            ("typeName", typeName),
            ("values",   MaybeList(vals))
        ));
    }

    private static SqlNode BuildAlterEnum(AlterEnumStmt ae, int start, int end) =>
        new("AlterTypeStatement", start, end, null, BuildProps(
            ("typeName",    string.Join(".", ae.TypeName.Select(n => n.String.Sval))),
            ("newVal",      ae.NewVal),
            ("neighbor",    string.IsNullOrEmpty(ae.NewValNeighbor) ? null : ae.NewValNeighbor),
            ("isAfter",     ae.NewValIsAfter ? true : null),
            ("ifNotExists", ae.SkipIfNewValExists ? true : null)
        ));

    private static List<string> ParseSeqOptions(Google.Protobuf.Collections.RepeatedField<Node> options) {
        var result = new List<string>();
        foreach (var o in options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            int? intVal = defElem.Arg?.NodeCase == Node.NodeOneofCase.Integer ? defElem.Arg.Integer.Ival
                : defElem.Arg?.NodeCase == Node.NodeOneofCase.AConst && defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival
                    ? defElem.Arg.AConst.Ival.Ival : (int?)null;
            switch (defElem.Defname) {
                case "start":     result.Add($"START WITH {intVal ?? 1}"); break;
                case "restart":   result.Add(intVal.HasValue ? $"RESTART WITH {intVal}" : "RESTART"); break;
                case "increment": result.Add($"INCREMENT BY {intVal ?? 1}"); break;
                case "minvalue":  result.Add(intVal.HasValue ? $"MINVALUE {intVal}" : "NO MINVALUE"); break;
                case "maxvalue":  result.Add(intVal.HasValue ? $"MAXVALUE {intVal}" : "NO MAXVALUE"); break;
                case "cache":     result.Add($"CACHE {intVal ?? 1}"); break;
                case "cycle":     result.Add(GetBoolFromArg(defElem.Arg) ? "CYCLE" : "NO CYCLE"); break;
            }
        }
        return result;
    }

    private SqlNode BuildCreateSeq(CreateSeqStmt seq, int start, int end) {
        var options = ParseSeqOptions(seq.Options);
        return new SqlNode("CreateSequenceStatement", start, end, null, BuildProps(
            ("name",        seq.Sequence?.Relname),
            ("schema",      string.IsNullOrEmpty(seq.Sequence?.Schemaname) ? null : seq.Sequence.Schemaname),
            ("ifNotExists", seq.IfNotExists ? true : null),
            ("options",     MaybeList(options))
        ));
    }

    private SqlNode BuildAlterSeq(AlterSeqStmt seq, int start, int end) {
        var options = ParseSeqOptions(seq.Options);
        return new SqlNode("AlterSequenceStatement", start, end, null, BuildProps(
            ("name",    seq.Sequence?.Relname),
            ("schema",  string.IsNullOrEmpty(seq.Sequence?.Schemaname) ? null : seq.Sequence.Schemaname),
            ("options", MaybeList(options))
        ));
    }

    private static SqlNode BuildCreateSchema(CreateSchemaStmt cs, int start, int end) =>
        new("CreateSchemaStatement", start, end, null, BuildProps(
            ("name",        cs.Schemaname),
            ("authRole",    cs.Authrole?.Rolename),
            ("ifNotExists", cs.IfNotExists ? true : null)
        ));

    private static SqlNode BuildCreateExtension(CreateExtensionStmt ce, int start, int end) {
        string? schema = null, version = null;
        foreach (var o in ce.Options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            if (defElem.Defname == "schema" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String) schema = defElem.Arg.String.Sval;
            if (defElem.Defname == "new_version" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String) version = defElem.Arg.String.Sval;
        }
        return new SqlNode("CreateExtensionStatement", start, end, null, BuildProps(
            ("name", ce.Extname), ("ifNotExists", ce.IfNotExists ? true : null),
            ("schema", schema), ("version", version)
        ));
    }

    private SqlNode BuildCreateTableAs(CreateTableAsStmt cta, int start, int end) {
        bool isMV = cta.Objtype == ObjectType.ObjectMatview;
        return new SqlNode(isMV ? "CreateMatViewStatement" : "CreateTableAsStatement", start, end, null, BuildProps(
            ("name",        cta.Into?.Rel?.Relname),
            ("schema",      string.IsNullOrEmpty(cta.Into?.Rel?.Schemaname) ? null : cta.Into!.Rel!.Schemaname),
            ("ifNotExists", cta.IfNotExists ? true : null),
            ("query",       cta.Query != null ? BuildExpr(cta.Query) : null)
        ));
    }

    private SqlNode BuildCreateTrigger(CreateTrigStmt t, int start, int end) {
        var timing = (t.Timing & 2) != 0 ? "BEFORE" : (t.Timing & 64) != 0 ? "INSTEAD OF" : "AFTER";
        var events = new List<string>();
        if ((t.Events & 4)  != 0) events.Add("INSERT");
        if ((t.Events & 8)  != 0) events.Add("DELETE");
        if ((t.Events & 16) != 0) events.Add("UPDATE");
        if ((t.Events & 32) != 0) events.Add("TRUNCATE");
        return new SqlNode("CreateTriggerStatement", start, end, null, BuildProps(
            ("name",      t.Trigname),
            ("timing",    timing),
            ("events",    (object?)events),
            ("relation",  BuildRangeVar(t.Relation)),
            ("forEach",   t.Row ? "ROW" : "STATEMENT"),
            ("funcName",  string.Join(".", t.Funcname.Select(n => n.String?.Sval))),
            ("when",      t.WhenClause != null ? BuildExpr(t.WhenClause) : null)
        ));
    }

    private SqlNode BuildComment(CommentStmt cm, int start, int end) {
        var objtype = ObjectTypeKw(cm.Objtype);
        string? objectName = cm.Object?.NodeCase switch {
            Node.NodeOneofCase.List           => string.Join(".", cm.Object.List.Items.Select(n => n.String?.Sval).OfType<string>()),
            Node.NodeOneofCase.ObjectWithArgs => OwaName(cm.Object.ObjectWithArgs.Objname),
            Node.NodeOneofCase.String         => cm.Object.String.Sval,
            Node.NodeOneofCase.TypeName       => string.Join(".", cm.Object.TypeName.Names
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval)
                .Where(v => v != "pg_catalog")),
            _ => null,
        };
        return new SqlNode("CommentStatement", start, end, null, BuildProps(
            ("objtype", objtype),
            ("object",  objectName),
            ("comment", string.IsNullOrEmpty(cm.Comment) ? null : cm.Comment)
        ));
    }

    private SqlNode BuildCall(CallStmt c, int start, int end) =>
        new("CallStatement", start, end, null, BuildProps(
            ("call", BuildFuncCall(c.Funccall))
        ));

    private static SqlNode BuildDo(DoStmt d, int start, int end) {
        string? language = null;
        string? body = null;
        foreach (var n in d.Args) {
            if (n.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = n.DefElem;
            if (defElem.Defname == "language" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String)
                language = defElem.Arg.String.Sval;
            if (defElem.Defname == "as" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String)
                body = defElem.Arg.String.Sval;
        }
        return new SqlNode("DoStatement", start, end, null, BuildProps(
            ("language", language),
            ("body",     body)
        ));
    }

    private SqlNode BuildMerge(MergeStmt m, int start, int end) =>
        new("MergeStatement", start, end, null, BuildProps(
            ("ctes",      m.WithClause != null ? BuildWithClause(m.WithClause) : null),
            ("target",    BuildRangeVar(m.Relation)),
            ("source",    m.SourceRelation != null ? BuildFromItem(m.SourceRelation) : null),
            ("on",        BuildExpr(m.JoinCondition)),
            ("whens",     MapList(m.MergeWhenClauses, BuildExpr)),
            ("returning", MapList(m.ReturningList, BuildExpr))
        ));

    private SqlNode BuildMergeWhen(MergeWhenClause w) {
        var matchKind = w.MatchKind switch {
            MergeMatchKind.MergeWhenMatched            => "MATCHED",
            MergeMatchKind.MergeWhenNotMatchedBySource => "NOT MATCHED BY SOURCE",
            MergeMatchKind.MergeWhenNotMatchedByTarget => "NOT MATCHED",
            _                                          => "MATCHED",
        };
        var cmd = w.CommandType switch {
            CmdType.CmdInsert  => "INSERT",
            CmdType.CmdUpdate  => "UPDATE",
            CmdType.CmdDelete  => "DELETE",
            CmdType.CmdNothing => "DO NOTHING",
            _                  => "DO NOTHING",
        };
        return new SqlNode("MergeWhen", 0, 0, null, BuildProps(
            ("matchKind", matchKind),
            ("cmd",       cmd),
            ("condition", BuildExpr(w.Condition)),
            ("targets",   MapList(w.TargetList, BuildExpr)),
            ("values",    MapList(w.Values, BuildExpr))
        ));
    }

    // -------------------------------------------------------------------------
    // P3 statement builders
    // -------------------------------------------------------------------------

    private SqlNode BuildAlterFunction(AlterFunctionStmt s, int start, int end) {
        // Extract actions from the DefElem list
        var actions = new List<(string key, string? value)>();
        foreach (var n in s.Actions) {
            if (n.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = n.DefElem;
            actions.Add((defElem.Defname, BuildDefElemValue(defElem)?.ToString()));
        }

        // Build the function name from ObjectWithArgs
        var funcName = s.Func != null
            ? string.Join(".", s.Func.Objname.Select(n => n.NodeCase == Node.NodeOneofCase.String ? n.String.Sval : ""))
            : null;

        // Build arg types
        var argTypes = s.Func != null && !s.Func.ArgsUnspecified
            ? (object?)s.Func.Objargs.Select(n => n.NodeCase == Node.NodeOneofCase.TypeName ? BuildPgTypeName(n.TypeName) : "").ToList()
            : null;

        // Determine action kind
        string? rename = null;
        var setOptions = new List<object?>();
        foreach (var (key, value) in actions) {
            if (key == "rename") {
                rename = value;
            } else if (value != null) {
                setOptions.Add(new Dictionary<string, object?> { ["name"] = key, ["value"] = value });
            } else {
                // No-value option like SET VOLATILE (just the name)
                setOptions.Add(new Dictionary<string, object?> { ["name"] = key });
            }
        }

        return new SqlNode("AlterFunctionStatement", start, end, null, BuildProps(
            ("name",     funcName),
            ("argTypes", argTypes),
            ("rename",   rename),
            ("options",  MaybeList(setOptions))
        ));
    }

    private static SqlNode BuildAlterOwner(AlterOwnerStmt s, int start, int end) {
        var newOwner = s.Newowner?.Roletype == RoleSpecType.RolespecPublic ? "PUBLIC" : s.Newowner?.Rolename;
        return new SqlNode("AlterOwnerStatement", start, end, null, BuildProps(
            ("objType",  ObjectTypeKw(s.ObjectType)),
            ("name",     NodeObjName(s.Object)),
            ("newOwner", newOwner)
        ));
    }

    private static SqlNode BuildAlterObjectSchema(AlterObjectSchemaStmt s, int start, int end) =>
        new("AlterObjectSchemaStatement", start, end, null, BuildProps(
            ("objType",   ObjectTypeKw(s.ObjectType)),
            ("name",      NodeObjName(s.Object)),
            ("newSchema", s.Newschema)
        ));

    private static SqlNode BuildRefreshMatView(RefreshMatViewStmt s, int start, int end) =>
        new("RefreshMatViewStatement", start, end, null, BuildProps(
            ("name",       BuildRangeVar(s.Relation)),
            ("concurrent", s.Concurrent ? true : null)
        ));

    private SqlNode BuildRule(RuleStmt s, int start, int end) {
        var eventName = s.Event switch {
            CmdType.CmdSelect => "SELECT",
            CmdType.CmdUpdate => "UPDATE",
            CmdType.CmdInsert => "INSERT",
            CmdType.CmdDelete => "DELETE",
            _                 => s.Event.ToString(),
        };
        return new SqlNode("RuleStatement", start, end, null, BuildProps(
            ("ruleName", s.Rulename),
            ("relation", BuildRangeVar(s.Relation)),
            ("event",    eventName),
            ("instead",  s.Instead ? true : null),
            ("where",    BuildExpr(s.WhereClause)),
            ("actions",  MapList(s.Actions, n => n.NodeCase switch {
                Node.NodeOneofCase.InsertStmt => BuildInsert(n.InsertStmt, 0, _sql.Length),
                Node.NodeOneofCase.UpdateStmt => BuildUpdate(n.UpdateStmt, 0, _sql.Length),
                Node.NodeOneofCase.DeleteStmt => BuildDelete(n.DeleteStmt, 0, _sql.Length),
                Node.NodeOneofCase.SelectStmt => BuildSelect(n.SelectStmt, 0, _sql.Length),
                _ => null,
            }))
        ));
    }

    private SqlNode BuildCreatePolicy(CreatePolicyStmt s, int start, int end) =>
        new("CreatePolicyStatement", start, end, null, BuildProps(
            ("policyName",  s.PolicyName),
            ("table",       BuildRangeVar(s.Table)),
            ("cmdName",     string.IsNullOrEmpty(s.CmdName) ? null : s.CmdName.ToUpper()),
            ("restrictive", !s.Permissive ? (object?)true : null),
            ("using",       BuildExpr(s.Qual)),
            ("withCheck",   BuildExpr(s.WithCheck))
        ));

    private SqlNode BuildAlterPolicy(AlterPolicyStmt s, int start, int end) =>
        new("AlterPolicyStatement", start, end, null, BuildProps(
            ("policyName", s.PolicyName),
            ("table",      BuildRangeVar(s.Table)),
            ("using",      BuildExpr(s.Qual)),
            ("withCheck",  BuildExpr(s.WithCheck))
        ));

    private SqlNode BuildDeclareCursor(DeclareCursorStmt s, int start, int end) {
        // Options bitmask: SCROLL=2, NO_SCROLL=4, INSENSITIVE=8, BINARY=16
        bool scroll     = (s.Options & 2) != 0;
        bool noScroll   = (s.Options & 4) != 0;
        bool insensitive = (s.Options & 8) != 0;
        bool binary     = (s.Options & 16) != 0;

        var query = s.Query != null ? BuildExpr(s.Query) : null;

        return new SqlNode("DeclareCursorStatement", start, end, null, BuildProps(
            ("name",        s.Portalname),
            ("scroll",      scroll     ? true : null),
            ("noScroll",    noScroll   ? true : null),
            ("insensitive", insensitive ? true : null),
            ("binary",      binary     ? true : null),
            ("query",       query)
        ));
    }

    private static SqlNode BuildFetch(FetchStmt s, int start, int end) {
        // libpg_query proto FetchDirection:
        //   FetchForward with howMany=1      => NEXT
        //   FetchBackward with howMany=1     => PRIOR
        //   FetchAbsolute with howMany=1     => FIRST
        //   FetchAbsolute with howMany=-1    => LAST
        //   FetchForward with howMany=MAX    => ALL
        //   FetchAbsolute / FetchRelative    => ABSOLUTE n / RELATIVE n
        string direction;
        long? count = null;
        switch (s.Direction) {
            case FetchDirection.FetchForward:
                if (s.HowMany == long.MaxValue || s.HowMany == long.MinValue) {
                    direction = "ALL";
                } else if (s.HowMany == 1) {
                    direction = "NEXT";
                } else {
                    direction = "FORWARD";
                    count = s.HowMany;
                }
                break;
            case FetchDirection.FetchBackward:
                if (s.HowMany == long.MaxValue || s.HowMany == long.MinValue) {
                    direction = "BACKWARD ALL";
                } else if (s.HowMany == 1) {
                    direction = "PRIOR";
                } else {
                    direction = "BACKWARD";
                    count = s.HowMany;
                }
                break;
            case FetchDirection.FetchAbsolute:
                if (s.HowMany == 1) {
                    direction = "FIRST";
                } else if (s.HowMany == -1) {
                    direction = "LAST";
                } else {
                    direction = "ABSOLUTE";
                    count = s.HowMany;
                }
                break;
            case FetchDirection.FetchRelative:
                direction = "RELATIVE";
                count = s.HowMany;
                break;
            default:
                direction = "NEXT";
                break;
        }

        return new SqlNode("FetchStatement", start, end, null, BuildProps(
            ("direction", direction),
            ("count",     count),
            ("cursor",    s.Portalname),
            ("isMove",    s.Ismove ? true : null)
        ));
    }

    private static SqlNode BuildClosePortal(ClosePortalStmt s, int start, int end) =>
        new("ClosePortalStatement", start, end, null, BuildProps(
            ("cursor", string.IsNullOrEmpty(s.Portalname) ? null : s.Portalname)
        ));

    private SqlNode BuildCopy(CopyStmt s, int start, int end) {
        // Build column list from attlist (String nodes)
        var columns = s.Attlist.Count > 0
            ? (object?)s.Attlist.Select(n => n.NodeCase == Node.NodeOneofCase.String ? n.String.Sval : "").ToList()
            : null;

        // Build options from DefElem list
        var options = s.Options.Count > 0
            ? (object?)s.Options
                .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
                .Select(n => new Dictionary<string, object?> {
                    ["name"]  = n.DefElem.Defname,
                    ["value"] = BuildDefElemValue(n.DefElem)
                })
                .ToList<object?>()
            : null;

        SqlNode? query = null;
        if (s.Query != null) {
            query = s.Query.NodeCase switch {
                Node.NodeOneofCase.SelectStmt => BuildSelect(s.Query.SelectStmt, 0, _sql.Length),
                Node.NodeOneofCase.InsertStmt => BuildInsert(s.Query.InsertStmt, 0, _sql.Length),
                Node.NodeOneofCase.UpdateStmt => BuildUpdate(s.Query.UpdateStmt, 0, _sql.Length),
                Node.NodeOneofCase.DeleteStmt => BuildDelete(s.Query.DeleteStmt, 0, _sql.Length),
                _ => null,
            };
        }

        return new SqlNode("CopyStatement", start, end, null, BuildProps(
            ("relation",  s.Relation != null ? BuildRangeVar(s.Relation) : null),
            ("query",     query),
            ("columns",   columns),
            ("isFrom",    s.IsFrom  ? true : null),
            ("isProgram", s.IsProgram ? true : null),
            ("filename",  string.IsNullOrEmpty(s.Filename) ? null : s.Filename),
            ("options",   options)
        ));
    }

    private SqlNode BuildExplain(ExplainStmt s, int start, int end) {
        var query = s.Query?.NodeCase switch {
            Node.NodeOneofCase.SelectStmt => BuildSelect(s.Query.SelectStmt, 0, _sql.Length),
            Node.NodeOneofCase.InsertStmt => BuildInsert(s.Query.InsertStmt, 0, _sql.Length),
            Node.NodeOneofCase.UpdateStmt => BuildUpdate(s.Query.UpdateStmt, 0, _sql.Length),
            Node.NodeOneofCase.DeleteStmt => BuildDelete(s.Query.DeleteStmt, 0, _sql.Length),
            _ => null,
        };

        var options = s.Options.Count > 0
            ? (object?)s.Options
                .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
                .Select(n => new Dictionary<string, object?> {
                    ["name"]  = n.DefElem.Defname,
                    ["value"] = BuildDefElemValue(n.DefElem)
                })
                .ToList<object?>()
            : null;

        return new SqlNode("ExplainStatement", start, end, null, BuildProps(
            ("query",   query),
            ("options", options)
        ));
    }

    private SqlNode BuildPrepare(PrepareStmt s, int start, int end) {
        var query = s.Query?.NodeCase switch {
            Node.NodeOneofCase.SelectStmt => BuildSelect(s.Query.SelectStmt, 0, _sql.Length),
            Node.NodeOneofCase.InsertStmt => BuildInsert(s.Query.InsertStmt, 0, _sql.Length),
            Node.NodeOneofCase.UpdateStmt => BuildUpdate(s.Query.UpdateStmt, 0, _sql.Length),
            Node.NodeOneofCase.DeleteStmt => BuildDelete(s.Query.DeleteStmt, 0, _sql.Length),
            _ => null,
        };

        var argTypes = s.Argtypes.Count > 0
            ? (object?)s.Argtypes
                .Where(n => n.NodeCase == Node.NodeOneofCase.TypeName)
                .Select(n => BuildPgTypeName(n.TypeName))
                .ToList()
            : null;

        return new SqlNode("PrepareStatement", start, end, null, BuildProps(
            ("name",     s.Name),
            ("argTypes", argTypes),
            ("query",    query)
        ));
    }

    private SqlNode BuildExecute(ExecuteStmt s, int start, int end) =>
        new("ExecuteStatement", start, end, null, BuildProps(
            ("name",   s.Name),
            ("params", MapList(s.Params, BuildExpr))
        ));

    private static SqlNode BuildDeallocate(DeallocateStmt s, int start, int end) =>
        new("DeallocateStatement", start, end, null, BuildProps(
            ("name", string.IsNullOrEmpty(s.Name) ? null : s.Name)
        ));

    private static SqlNode BuildListen(ListenStmt s, int start, int end) =>
        new("ListenStatement", start, end, null, BuildProps(
            ("channel", s.Conditionname)
        ));

    private static SqlNode BuildUnlisten(UnlistenStmt s, int start, int end) =>
        new("UnlistenStatement", start, end, null, BuildProps(
            ("channel", string.IsNullOrEmpty(s.Conditionname) ? null : s.Conditionname)
        ));

    private static SqlNode BuildNotify(NotifyStmt s, int start, int end) =>
        new("NotifyStatement", start, end, null, BuildProps(
            ("channel", s.Conditionname),
            ("payload", string.IsNullOrEmpty(s.Payload) ? null : s.Payload)
        ));

    private SqlNode BuildLock(LockStmt s, int start, int end) {
        var modeName = s.Mode switch {
            1 => "ACCESS SHARE",
            2 => "ROW SHARE",
            3 => "ROW EXCLUSIVE",
            4 => "SHARE UPDATE EXCLUSIVE",
            5 => "SHARE",
            6 => "SHARE ROW EXCLUSIVE",
            7 => "EXCLUSIVE",
            8 => "ACCESS EXCLUSIVE",
            _ => "ACCESS EXCLUSIVE",
        };
        var relations = s.Relations
            .Where(n => n.NodeCase == Node.NodeOneofCase.RangeVar)
            .Select(n => BuildRangeVar(n.RangeVar))
            .ToList();
        return new SqlNode("LockStatement", start, end, null, BuildProps(
            ("relations", MaybeList(relations)),
            ("mode",      modeName),
            ("nowait",    s.Nowait ? true : null)
        ));
    }

    private SqlNode BuildGroupingFunc(GroupingFunc g) =>
        new("GroupingFunc", 0, 0, null, BuildProps(
            ("args", MapList(g.Args, BuildExpr))
        ));

    private SqlNode BuildXmlExpr(XmlExpr xe) {
        var op = xe.Op switch {
            XmlExprOp.IsXmlelement => "XMLELEMENT",
            XmlExprOp.IsXmlforest  => "XMLFOREST",
            XmlExprOp.IsXmlconcat  => "XMLCONCAT",
            XmlExprOp.IsXmlparse   => "XMLPARSE",
            XmlExprOp.IsXmlpi      => "XMLPI",
            XmlExprOp.IsXmlroot    => "XMLROOT",
            XmlExprOp.IsXmlserialize => "XMLSERIALIZE",
            XmlExprOp.IsDocument   => "IS DOCUMENT",
            _ => xe.Op.ToString(),
        };
        // NamedArgs are ResTarget nodes (val + name) used in XMLELEMENT attributes / XMLFOREST cols
        var namedArgs = MapList(xe.NamedArgs, n =>
            n.NodeCase == Node.NodeOneofCase.ResTarget ? BuildResTarget(n.ResTarget) : BuildExpr(n));
        return new SqlNode("XmlExpr", 0, 0, null, BuildProps(
            ("op",        op),
            ("name",      string.IsNullOrEmpty(xe.Name) ? null : xe.Name),
            ("args",      MapList(xe.Args, BuildExpr)),
            ("namedArgs", namedArgs)
        ));
    }

    private SqlNode BuildJsonFuncExpr(JsonFuncExpr je) {
        var op = je.Op switch {
            JsonExprOp.JsonQueryOp  => "JSON_QUERY",
            JsonExprOp.JsonExistsOp => "JSON_EXISTS",
            JsonExprOp.JsonValueOp  => "JSON_VALUE",
            _ => je.Op.ToString(),
        };
        var context = je.ContextItem != null ? BuildExpr(je.ContextItem.RawExpr) : null;
        var path    = je.Pathspec != null ? BuildExpr(je.Pathspec) : null;
        string? returning = null;
        if (je.Output?.TypeName != null)
            returning = BuildPgTypeName(je.Output.TypeName);
        return new SqlNode("JsonFuncExpr", 0, 0, null, BuildProps(
            ("op",        op),
            ("context",   context),
            ("path",      path),
            ("returning", returning)
        ));
    }

    // Helper to extract a string or bool value from a DefElem Arg
    private static object? BuildDefElemValue(DefElem defElem) {
        if (defElem.Arg == null) return null;
        return defElem.Arg.NodeCase switch {
            Node.NodeOneofCase.String  => defElem.Arg.String.Sval,
            Node.NodeOneofCase.Integer => defElem.Arg.Integer.Ival.ToString(),
            Node.NodeOneofCase.Float   => defElem.Arg.Float.Fval,
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval    => defElem.Arg.AConst.Sval.Sval,
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival    => defElem.Arg.AConst.Ival.Ival.ToString(),
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Fval    => defElem.Arg.AConst.Fval.Fval,
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Boolval => defElem.Arg.AConst.Boolval.Boolval ? "true" : "false",
            _ => null,
        };
    }

    // -------------------------------------------------------------------------
    // P4: VACUUM / ANALYZE / CLUSTER / REINDEX
    // -------------------------------------------------------------------------

    private static SqlNode BuildVacuum(VacuumStmt s, int start, int end) {
        var isVacuum = s.IsVacuumcmd;
        var options = s.Options
            .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
            .Select(n => n.DefElem.Defname.ToUpper())
            .ToList();
        var rels = s.Rels
            .Where(n => n.NodeCase == Node.NodeOneofCase.VacuumRelation)
            .Select(n => BuildRangeVar(n.VacuumRelation.Relation))
            .ToList();

        return new SqlNode("VacuumStatement", start, end, null, BuildProps(
            ("isVacuum",  isVacuum ? true : null),
            ("options",   MaybeList(options)),
            ("relations", MaybeList(rels))
        ));
    }

    private static SqlNode BuildCluster(ClusterStmt s, int start, int end) =>
        new("ClusterStatement", start, end, null, BuildProps(
            ("relation",  s.Relation != null ? BuildRangeVar(s.Relation) : null),
            ("indexName", string.IsNullOrEmpty(s.Indexname) ? null : s.Indexname)
        ));

    private static SqlNode BuildReindex(ReindexStmt s, int start, int end) {
        var kind = s.Kind switch {
            ReindexObjectType.ReindexObjectTable    => "TABLE",
            ReindexObjectType.ReindexObjectIndex    => "INDEX",
            ReindexObjectType.ReindexObjectSchema   => "SCHEMA",
            ReindexObjectType.ReindexObjectDatabase => "DATABASE",
            _                                       => "TABLE",
        };
        var options = s.Params
            .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
            .Select(n => n.DefElem.Defname.ToUpper())
            .ToList();
        return new SqlNode("ReindexStatement", start, end, null, BuildProps(
            ("kind",     kind),
            ("relation", s.Relation != null ? BuildRangeVar(s.Relation) : null),
            ("options",  MaybeList(options))
        ));
    }

    // -------------------------------------------------------------------------
    // P4: Foreign Data Wrappers
    // -------------------------------------------------------------------------

    private static List<(string key, string val)> BuildDefElemOptions(IEnumerable<Node> nodes) {
        return nodes
            .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
            .Select(n => {
                var defElem = n.DefElem;
                string val = defElem.Arg?.NodeCase switch {
                    Node.NodeOneofCase.String => defElem.Arg.String.Sval,
                    Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval
                        => defElem.Arg.AConst.Sval.Sval,
                    _ => "",
                };
                return (defElem.Defname, val);
            })
            .ToList();
    }

    private static object? OptionsToObject(List<(string key, string val)> options) {
        if (options.Count == 0) return null;
        return options.Select(o => new SqlNode("FdwOption", 0, 0, null, BuildProps(
            ("key", o.key),
            ("val", o.val)
        ))).ToList();
    }

    private static SqlNode BuildCreateForeignServer(CreateForeignServerStmt s, int start, int end) {
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("CreateForeignServerStatement", start, end, null, BuildProps(
            ("name",    s.Servername),
            ("fdwName", s.Fdwname),
            ("options", OptionsToObject(options))
        ));
    }

    private SqlNode BuildCreateForeignTable(CreateForeignTableStmt s, int start, int end) {
        var columns = s.BaseStmt != null ? MapList(s.BaseStmt.TableElts, BuildTableElement) : null;
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("CreateForeignTableStatement", start, end, null, BuildProps(
            ("name",       s.BaseStmt?.Relation != null ? BuildRangeVar(s.BaseStmt.Relation) : null),
            ("columns",    columns),
            ("serverName", s.Servername),
            ("options",    OptionsToObject(options))
        ));
    }

    private static SqlNode BuildCreateUserMapping(CreateUserMappingStmt s, int start, int end) {
        var roleText = s.User?.Roletype switch {
            RoleSpecType.RolespecCurrentUser  => "current_user",
            RoleSpecType.RolespecCurrentRole  => "current_role",
            RoleSpecType.RolespecSessionUser  => "session_user",
            RoleSpecType.RolespecPublic       => "public",
            _                                 => s.User?.Rolename ?? "current_user",
        };
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("CreateUserMappingStatement", start, end, null, BuildProps(
            ("user",       roleText),
            ("serverName", s.Servername),
            ("options",    OptionsToObject(options))
        ));
    }

    private static SqlNode BuildImportForeignSchema(ImportForeignSchemaStmt s, int start, int end) =>
        new("ImportForeignSchemaStatement", start, end, null, BuildProps(
            ("remoteSchema", s.RemoteSchema),
            ("serverName",   s.ServerName),
            ("localSchema",  s.LocalSchema)
        ));

    // -------------------------------------------------------------------------
    // P4: Logical Replication
    // -------------------------------------------------------------------------

    private static SqlNode BuildCreatePublication(CreatePublicationStmt s, int start, int end) {
        var tables = s.Pubobjects
            .Where(n => n.NodeCase == Node.NodeOneofCase.PublicationObjSpec
                && n.PublicationObjSpec.Pubobjtype == PublicationObjSpecType.PublicationobjTable)
            .Select(n => BuildRangeVar(n.PublicationObjSpec.Pubtable?.Relation))
            .ToList();
        return new SqlNode("CreatePublicationStatement", start, end, null, BuildProps(
            ("name",        s.Pubname),
            ("forAllTables", s.ForAllTables ? true : null),
            ("tables",      MaybeList(tables))
        ));
    }

    private static SqlNode BuildAlterPublication(AlterPublicationStmt s, int start, int end) =>
        new("AlterPublicationStatement", start, end, null, BuildProps(
            ("name", s.Pubname)
        ));

    private static SqlNode BuildCreateSubscription(CreateSubscriptionStmt s, int start, int end) {
        var publications = s.Publication
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => n.String.Sval)
            .ToList();
        return new SqlNode("CreateSubscriptionStatement", start, end, null, BuildProps(
            ("name",         s.Subname),
            ("conninfo",     s.Conninfo),
            ("publications", MaybeList(publications))
        ));
    }

    private static SqlNode BuildAlterSubscription(AlterSubscriptionStmt s, int start, int end) =>
        new("AlterSubscriptionStatement", start, end, null, BuildProps(
            ("name", s.Subname)
        ));

    private static SqlNode BuildDropSubscription(DropSubscriptionStmt s, int start, int end) =>
        new("DropSubscriptionStatement", start, end, null, BuildProps(
            ("name",     s.Subname),
            ("ifExists", s.MissingOk ? true : null)
        ));

    // -------------------------------------------------------------------------
    // P4: DefineStmt (CREATE AGGREGATE / OPERATOR / COLLATION)
    // -------------------------------------------------------------------------

    private SqlNode BuildDefine(DefineStmt s, int start, int end) {
        var name = string.Join(".", s.Defnames.Select(n => n.NodeCase == Node.NodeOneofCase.String
            ? n.String.Sval
            : n.NodeCase.ToString()));

        var defList = s.Definition
            .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
            .Select(n => {
                var defElem = n.DefElem;
                string argStr = BuildDefElemStringValue(defElem);
                return new SqlNode("DefOption", 0, 0, null, BuildProps(
                    ("key", defElem.Defname),
                    ("val", argStr.Length > 0 ? argStr : null)
                ));
            })
            .ToList();

        switch (s.Kind) {
            case ObjectType.ObjectAggregate: {
                var argTypes = new List<string>();
                if (s.Args.Count > 0 && s.Args[0].NodeCase == Node.NodeOneofCase.List) {
                    foreach (var item in s.Args[0].List.Items) {
                        if (item.NodeCase == Node.NodeOneofCase.FunctionParameter && item.FunctionParameter.ArgType != null) {
                            argTypes.Add(BuildPgTypeName(item.FunctionParameter.ArgType));
                        }
                    }
                }
                return new SqlNode("CreateAggregateStatement", start, end, null, BuildProps(
                    ("name",     name),
                    ("argTypes", MaybeList(argTypes)),
                    ("options",  MaybeList(defList))
                ));
            }
            case ObjectType.ObjectOperator: {
                return new SqlNode("CreateOperatorStatement", start, end, null, BuildProps(
                    ("name",    name),
                    ("options", MaybeList(defList))
                ));
            }
            case ObjectType.ObjectCollation: {
                var fromDef = s.Definition.FirstOrDefault(n =>
                    n.NodeCase == Node.NodeOneofCase.DefElem && n.DefElem.Defname == "from");
                if (fromDef != null) {
                    var fromVal = GetFromDefElemCollationName(fromDef.DefElem);
                    return new SqlNode("CreateCollationStatement", start, end, null, BuildProps(
                        ("name",     name),
                        ("fromName", fromVal)
                    ));
                }
                return new SqlNode("CreateCollationStatement", start, end, null, BuildProps(
                    ("name",    name),
                    ("options", MaybeList(defList))
                ));
            }
            default:
                return Fallback(start, end);
        }
    }

    private static string BuildDefElemStringValue(DefElem defElem) {
        if (defElem.Arg == null) return "";
        return defElem.Arg.NodeCase switch {
            Node.NodeOneofCase.String   => $"'{defElem.Arg.String.Sval.Replace("'", "''")}'",
            Node.NodeOneofCase.TypeName => BuildPgTypeName(defElem.Arg.TypeName),
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval
                => $"'{defElem.Arg.AConst.Sval.Sval.Replace("'", "''")}'",
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival
                => defElem.Arg.AConst.Ival.Ival.ToString(),
            _ => "",
        };
    }

    private static string? GetFromDefElemCollationName(DefElem defElem) {
        if (defElem.Arg?.NodeCase == Node.NodeOneofCase.List && defElem.Arg.List.Items.Count > 0) {
            var item = defElem.Arg.List.Items[0];
            if (item.NodeCase == Node.NodeOneofCase.String) return item.String.Sval;
        }
        if (defElem.Arg?.NodeCase == Node.NodeOneofCase.String) return defElem.Arg.String.Sval;
        return null;
    }

    // -------------------------------------------------------------------------
    // P4: Security Labels
    // -------------------------------------------------------------------------

    private static SqlNode BuildSecLabel(SecLabelStmt s, int start, int end) {
        var objType = s.Objtype switch {
            ObjectType.ObjectTable  => "table",
            ObjectType.ObjectColumn => "column",
            _                      => s.Objtype.ToString().ToLower(),
        };

        string? objName = null;
        if (s.Object?.NodeCase == Node.NodeOneofCase.List) {
            objName = string.Join(".", s.Object.List.Items
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval));
        } else if (s.Object?.NodeCase == Node.NodeOneofCase.RangeVar) {
            var rv = s.Object.RangeVar;
            objName = string.IsNullOrEmpty(rv.Schemaname) ? rv.Relname : $"{rv.Schemaname}.{rv.Relname}";
        }

        return new SqlNode("SecurityLabelStatement", start, end, null, BuildProps(
            ("provider", s.Provider),
            ("objType",  objType),
            ("objName",  objName),
            ("label",    s.Label)
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

    /// <summary>Returns list cast to object? if non-empty, otherwise null — for use in BuildProps.</summary>
    private static object? MaybeList<T>(ICollection<T> list) => list.Count > 0 ? (object?)list : null;

    private static Dictionary<string, object?> BuildProps(
        params (string key, object? value)[] entries
    ) {
        var dict = new Dictionary<string, object?>();
        foreach (var (key, value) in entries) {
            if (value != null) dict[key] = value;
        }
        return dict;
    }

    /// <summary>Maps an ObjectType enum to its SQL keyword string.</summary>
    private static string ObjectTypeKw(ObjectType t) => t switch {
        ObjectType.ObjectTable     => "TABLE",
        ObjectType.ObjectIndex     => "INDEX",
        ObjectType.ObjectView      => "VIEW",
        ObjectType.ObjectMatview   => "MATERIALIZED VIEW",
        ObjectType.ObjectSequence  => "SEQUENCE",
        ObjectType.ObjectFunction  => "FUNCTION",
        ObjectType.ObjectProcedure => "PROCEDURE",
        ObjectType.ObjectType      => "TYPE",
        ObjectType.ObjectSchema    => "SCHEMA",
        ObjectType.ObjectDatabase  => "DATABASE",
        ObjectType.ObjectExtension => "EXTENSION",
        ObjectType.ObjectTrigger   => "TRIGGER",
        ObjectType.ObjectRule      => "RULE",
        ObjectType.ObjectPolicy    => "POLICY",
        ObjectType.ObjectDomain    => "DOMAIN",
        ObjectType.ObjectRole      => "ROLE",
        ObjectType.ObjectColumn    => "COLUMN",
        _                          => t.ToString().Replace("Object", "").ToUpper(),
    };

    /// <summary>Extracts a dotted name from an ObjectWithArgs.Objname list.</summary>
    private static string OwaName(Google.Protobuf.Collections.RepeatedField<Node> objname) =>
        string.Join(".", objname.Select(n => n.String.Sval));

    /// <summary>Extracts a dotted name from a Node (RangeVar, ObjectWithArgs, List of strings, or String).</summary>
    private static string? NodeObjName(Node? node) => node?.NodeCase switch {
        Node.NodeOneofCase.RangeVar       => node.RangeVar.Relname,
        Node.NodeOneofCase.ObjectWithArgs => OwaName(node.ObjectWithArgs.Objname),
        Node.NodeOneofCase.List           => string.Join(".", node.List.Items
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => n.String.Sval)),
        Node.NodeOneofCase.String         => node.String.Sval,
        _                                 => null,
    };

    private static bool GetBoolFromArg(Node? arg) => arg?.NodeCase switch {
        Node.NodeOneofCase.Integer => arg.Integer.Ival != 0,
        Node.NodeOneofCase.Boolean => arg.Boolean.Boolval,
        Node.NodeOneofCase.AConst when arg.AConst.ValCase == A_Const.ValOneofCase.Ival => arg.AConst.Ival.Ival != 0,
        _ => true,
    };
}
