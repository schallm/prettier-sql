using System.Reflection;
using PgSqlParser;
using PrettierSql.Core;

namespace PrettierPgsql;

/// <summary>
/// Thrown when the parse tree contains a construct AstBuilder has no mapping for.
/// Formatting must fail loudly here rather than silently drop or mislabel the user's SQL —
/// see the "Unknown expression" / "Unknown FROM item" sites in AstBuilder for the alternative
/// this replaces (emitting null/placeholder text, which either vanished silently or produced
/// an unhelpful `/* unknown: RawExpr */` marker with no indication of the actual construct).
/// </summary>
public class UnsupportedSqlException : Exception {
    public UnsupportedSqlException(string message) : base(message) { }
}

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

    // Most raw-parser node messages expose an int32 "Location" (byte offset into the source).
    // There's no shared interface for it across the ~180 protobuf message types, so we read it
    // via reflection off whichever submessage the oneof is currently holding.
    private static int? TryGetLocation(object? boxedMessage) {
        var prop = boxedMessage?.GetType().GetProperty("Location", BindingFlags.Public | BindingFlags.Instance);
        return prop?.GetValue(boxedMessage) as int?;
    }

    private UnsupportedSqlException NotSupported(string what, int? location) {
        if (location is int loc && loc >= 0 && loc < _sql.Length) {
            var snippetEnd = Math.Min(_sql.Length, loc + 40);
            var snippet = _sql[loc..snippetEnd].ReplaceLineEndings(" ").Trim();
            return new UnsupportedSqlException($"Unsupported {what} near position {loc}: \"{snippet}\"");
        }
        return new UnsupportedSqlException($"Unsupported {what}");
    }

    /// <summary>
    /// Dispatches the DML statement kinds PostgreSQL accepts wherever it takes a
    /// plain "query" — WITH cte AS (query), COPY (query) TO ..., PREPARE ... AS query:
    /// SELECT, INSERT, UPDATE, DELETE, and (writable CTEs / RETURNING) MERGE.
    /// Returns null for anything else so callers with additional legal kinds of
    /// their own (e.g. EXPLAIN, which also allows CREATE TABLE AS / DECLARE CURSOR /
    /// REFRESH MATERIALIZED VIEW / EXECUTE) can layer their own cases on top rather
    /// than duplicating this dispatch.
    /// </summary>
    private SqlNode? TryBuildDmlQuery(Node query) => query.NodeCase switch {
        Node.NodeOneofCase.SelectStmt => BuildSelect(query.SelectStmt, 0, _sql.Length),
        Node.NodeOneofCase.InsertStmt => BuildInsert(query.InsertStmt, 0, _sql.Length),
        Node.NodeOneofCase.UpdateStmt => BuildUpdate(query.UpdateStmt, 0, _sql.Length),
        Node.NodeOneofCase.DeleteStmt => BuildDelete(query.DeleteStmt, 0, _sql.Length),
        Node.NodeOneofCase.MergeStmt  => BuildMerge(query.MergeStmt, 0, _sql.Length),
        _ => null,
    };

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
            Node.NodeOneofCase.DiscardStmt              => BuildDiscard(stmt.DiscardStmt, start, end),
            Node.NodeOneofCase.CheckPointStmt           => new SqlNode("CheckpointStatement", start, end, null, null),
            Node.NodeOneofCase.LoadStmt                 => BuildLoad(stmt.LoadStmt, start, end),
            Node.NodeOneofCase.AlterSystemStmt          => BuildAlterSystem(stmt.AlterSystemStmt, start, end),
            Node.NodeOneofCase.ReassignOwnedStmt        => BuildReassignOwned(stmt.ReassignOwnedStmt, start, end),
            Node.NodeOneofCase.DropOwnedStmt            => BuildDropOwned(stmt.DropOwnedStmt, start, end),
            Node.NodeOneofCase.CreateTableSpaceStmt     => BuildCreateTableSpace(stmt.CreateTableSpaceStmt, start, end),
            Node.NodeOneofCase.DropTableSpaceStmt       => BuildDropTableSpace(stmt.DropTableSpaceStmt, start, end),
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
            var setOpProps = BuildProps(
                ("op",  opName),
                ("all", s.All ? true : null),
                ("lhs", s.Larg != null ? BuildSelect(s.Larg, start, end) : null),
                ("rhs", s.Rarg != null ? BuildSelect(s.Rarg, start, end) : null)
            );
            AddQueryClauses(setOpProps, s);
            return new SqlNode("SetOpStatement", start, end, null, setOpProps);
        }

        // VALUES
        if (s.ValuesLists.Count > 0) {
            var rows = s.ValuesLists
                .Select(r => r.NodeCase == Node.NodeOneofCase.List
                    ? (SqlNode?)new SqlNode("ExprList", 0, 0, null, BuildProps(("items", MapList(r.List.Items, BuildExpr))))
                    : null)
                .Where(n => n != null).Cast<SqlNode>().ToList();
            var valuesProps = BuildProps(("rows", MaybeList(rows)));
            AddQueryClauses(valuesProps, s);
            return new SqlNode("ValuesStatement", start, end, null, valuesProps);
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
            ("groupDistinct", s.GroupDistinct ? true : null),
            ("having",        BuildExpr(s.HavingClause)),
            ("distinct",      distinctFlag),
            ("distinctOn",    distinctOn),
            ("all",           s.All ? true : null),
            ("windowClauses", s.WindowClause.Count > 0
                ? (object?)s.WindowClause
                    .Where(n => n.NodeCase == Node.NodeOneofCase.WindowDef)
                    .Select(n => BuildWindowDef(n.WindowDef))
                    .ToList()
                : null)
        );
        AddQueryClauses(props, s);
        return new SqlNode("SelectStatement", start, end, null, props);
    }

    /// <summary>
    /// The clauses any query can carry — WITH before it; ORDER BY, LIMIT/OFFSET and
    /// locking after — whether it's a plain SELECT, a set operation, where they apply
    /// to the combined result, or VALUES.
    /// </summary>
    private void AddQueryClauses(Dictionary<string, object?> props, SelectStmt s) {
        void Add(string key, object? value) { if (value != null) props[key] = value; }
        Add("ctes",     s.WithClause != null ? BuildWithClause(s.WithClause) : null);
        Add("orderBy",  MapList(s.SortClause, BuildExpr));
        Add("limit",    BuildExpr(s.LimitCount));
        Add("offset",   BuildExpr(s.LimitOffset));
        // FETCH FIRST n ROWS WITH TIES: also returns rows tied with the last one
        Add("withTies", s.LimitOption == LimitOption.WithTies ? true : null);
        Add("locking",  MapList(s.LockingClause, BuildLockingClause));
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
                ("name",        BuildRangeVar(s.Relation)),
                ("parent",      parent),
                ("bound",       bound),
                ("partitionBy", BuildPartitionBy(s.Partspec))
            ));
        }

        SqlNode? partitionBy = BuildPartitionBy(s.Partspec);

        return new SqlNode("CreateTableStatement", start, end, null, BuildProps(
            ("persistence",  Persistence(s.Relation)),
            ("ifNotExists",  s.IfNotExists ? true : null),
            ("name",         BuildRangeVar(s.Relation)),
            ("columns",      MapList(s.TableElts, BuildTableElement)),
            ("inherits",     MapList(s.InhRelations, n => n.NodeCase == Node.NodeOneofCase.RangeVar ? BuildRangeVar(n.RangeVar) : null)),
            ("partitionBy",  partitionBy),
            ("accessMethod", string.IsNullOrEmpty(s.AccessMethod) ? null : Ident.Quote(s.AccessMethod)),
            ("options",      StorageOptions(s.Options)),
            ("onCommit",     OnCommit(s.Oncommit)),
            ("tablespace",   Ident.QuoteOpt(s.Tablespacename))
        ));
    }

    // TEMPORARY / UNLOGGED from a relation's relpersistence ('p' is a regular table).
    private static string? Persistence(RangeVar? r) => r?.Relpersistence switch {
        "t" => "TEMPORARY",
        "u" => "UNLOGGED",
        _   => null,
    };

    private static string? OnCommit(OnCommitAction a) => a switch {
        OnCommitAction.OncommitPreserveRows => "PRESERVE ROWS",
        OnCommitAction.OncommitDeleteRows   => "DELETE ROWS",
        OnCommitAction.OncommitDrop         => "DROP",
        _                                   => null,
    };

    // WITH (storage_parameter = value, ...) as ready-to-print "name = value" strings.
    private static object? StorageOptions(IEnumerable<Node> options) => MaybeList(options
        .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
        .Select(n => {
            var d = n.DefElem;
            var name = string.IsNullOrEmpty(d.Defnamespace) ? d.Defname : $"{d.Defnamespace}.{d.Defname}";
            var value = BuildDefElemValue(d, quoteStrings: true);
            return value == null ? name : $"{name} = {value}";
        })
        .ToList());

    // PARTITION BY strategy (column list) — used by both plain CREATE TABLE and
    // CREATE TABLE ... PARTITION OF, either of which can itself be further partitioned.
    private static SqlNode? BuildPartitionBy(PartitionSpec? spec) {
        if (spec == null) return null;
        var strategy = spec.Strategy switch {
            PartitionStrategy.Range => "range",
            PartitionStrategy.List  => "list",
            PartitionStrategy.Hash  => "hash",
            _                      => spec.Strategy.ToString().ToLower(),
        };
        var cols = spec.PartParams
            .Select(n => {
                if (n.NodeCase == Node.NodeOneofCase.PartitionElem) {
                    var pe = n.PartitionElem;
                    if (!string.IsNullOrEmpty(pe.Name)) return Ident.Quote(pe.Name);
                    // Expression-based partition element: extract ColumnRef name
                    if (pe.Expr?.NodeCase == Node.NodeOneofCase.ColumnRef) {
                        var fields = pe.Expr.ColumnRef.Fields;
                        if (fields.Count > 0 && fields[0].NodeCase == Node.NodeOneofCase.String)
                            return Ident.Quote(fields[0].String.Sval);
                    }
                }
                return null;
            })
            .Where(c => !string.IsNullOrEmpty(c))
            .Cast<string>()
            .ToList();
        return new SqlNode("PartitionBy", 0, 0, null, BuildProps(
            ("strategy", strategy),
            ("columns",  MaybeList(cols))
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

    private string? BuildPartitionDatum(Node n) {
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
            // ALTER TABLE / VIEW / INDEX / SEQUENCE / MATERIALIZED VIEW / FOREIGN TABLE all parse here
            ("objType",  ObjectTypeKw(s.Objtype)),
            // ALTER TYPE t ADD / DROP / ALTER ATTRIBUTE: a composite type's column commands
            ("attributes", s.Objtype == ObjectType.ObjectType ? true : null),
            ("name",     BuildRangeVar(s.Relation)),
            ("ifExists", s.MissingOk ? true : null),
            ("commands", MapList(s.Cmds, BuildAlterCmd))
        ));

    private SqlNode BuildCreateView(ViewStmt s, int start, int end) =>
        new("CreateViewStatement", start, end, null, BuildProps(
            ("orReplace",   s.Replace ? true : null),
            ("persistence", Persistence(s.View)),
            ("name", BuildRangeVar(s.View)),
            ("columns",     MaybeList(s.Aliases
                .Where(a => a.NodeCase == Node.NodeOneofCase.String)
                .Select(a => Ident.Quote(a.String.Sval))
                .ToList())),
            ("options",     StorageOptions(s.Options)),
            ("checkOption", s.WithCheckOption switch {
                ViewCheckOption.LocalCheckOption    => "LOCAL",
                ViewCheckOption.CascadedCheckOption => "CASCADED",
                _                                   => null,
            }),
            ("body", s.Query?.NodeCase == Node.NodeOneofCase.SelectStmt
                ? BuildSelect(s.Query.SelectStmt, start, end)
                : null)
        ));

    private SqlNode BuildCreateFunction(CreateFunctionStmt s, int start, int end) {
        // A SQL-standard body (RETURN expr / BEGIN ATOMIC ... END) isn't supported yet;
        // it used to vanish, leaving a function with no body at all.
        if (s.SqlBody != null && s.SqlBody.NodeCase != Node.NodeOneofCase.None)
            throw NotSupported("SQL-standard function body (RETURN / BEGIN ATOMIC)", null);

        string? language = null;
        List<string>? body = null;
        var attributes = new List<string>();
        foreach (var o in s.Options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            switch (defElem.Defname) {
                case "language":
                    if (defElem.Arg?.NodeCase == Node.NodeOneofCase.String)
                        language = Ident.Quote(defElem.Arg.String.Sval);
                    break;
                case "as":
                    // One string (the body), or two for a C function: 'obj_file', 'link_symbol'
                    if (defElem.Arg?.NodeCase == Node.NodeOneofCase.List)
                        body = defElem.Arg.List.Items
                            .Where(i => i.NodeCase == Node.NodeOneofCase.String)
                            .Select(i => i.String.Sval)
                            .ToList();
                    break;
                default:
                    attributes.Add(FunctionAttribute(defElem));
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
            ("orReplace",    s.Replace ? true : null),
            ("isProcedure",  s.IsProcedure ? true : null),
            ("name",         s.Funcname.Count > 0 ? Ident.QualifiedFunc(s.Funcname.Select(n => n.String.Sval)) : null),
            ("parameters",   MapList(regularParams, BuildFunctionParam)),
            ("returnType",   tableParams.Count == 0 && s.ReturnType != null ? BuildPgTypeName(s.ReturnType) : null),
            ("returnsTable", MaybeList(tableParams)),
            ("language",     language),
            ("attributes",   MaybeList(attributes)),
            ("body",         body != null ? MaybeList(body) : null)
        ));
    }

    // One CREATE FUNCTION / ALTER FUNCTION attribute as SQL text: IMMUTABLE, STRICT,
    // SECURITY DEFINER, PARALLEL SAFE, COST 10, SET search_path = x, ...
    private string FunctionAttribute(DefElem d) {
        bool Flag() => GetBoolFromArg(d.Arg);
        string Value() => BuildDefElemValue(d)?.ToString() ?? throw NotSupported($"function attribute value ({d.Defname})", d.Location);
        return d.Defname switch {
            "volatility" => Value().ToUpperInvariant(),
            "strict"     => Flag() ? "STRICT" : "CALLED ON NULL INPUT",
            "security"   => Flag() ? "SECURITY DEFINER" : "SECURITY INVOKER",
            "leakproof"  => Flag() ? "LEAKPROOF" : "NOT LEAKPROOF",
            "window"     => "WINDOW",
            "parallel"   => $"PARALLEL {Value().ToUpperInvariant()}",
            "cost"       => $"COST {Value()}",
            "rows"       => $"ROWS {Value()}",
            "support"    => $"SUPPORT {(d.Arg?.NodeCase == Node.NodeOneofCase.List ? Ident.QualifiedFunc(d.Arg.List.Items.Select(i => i.String.Sval)) : Value())}",
            "set" when d.Arg?.NodeCase == Node.NodeOneofCase.VariableSetStmt => FunctionSetClause(d.Arg.VariableSetStmt),
            _ => throw NotSupported($"function attribute ({d.Defname})", d.Location),
        };
    }

    // SET name = value / SET name FROM CURRENT / RESET name / RESET ALL, inside CREATE FUNCTION
    private string FunctionSetClause(VariableSetStmt v) => v.Kind switch {
        VariableSetKind.VarSetValue   => $"SET {v.Name} = {string.Join(", ", v.Args.Select(SetValue))}",
        VariableSetKind.VarSetDefault => $"SET {v.Name} TO DEFAULT",
        VariableSetKind.VarSetCurrent => $"SET {v.Name} FROM CURRENT",
        VariableSetKind.VarReset      => $"RESET {v.Name}",
        VariableSetKind.VarResetAll   => "RESET ALL",
        _ => throw NotSupported($"function SET clause ({v.Kind})", null),
    };

    private SqlNode BuildCreateIndex(IndexStmt s, int start, int end) =>
        new("CreateIndexStatement", start, end, null, BuildProps(
            ("indexName",    Ident.QuoteOpt(s.Idxname)),
            ("relation",     BuildRangeVar(s.Relation)),
            ("columns",      MapList(s.IndexParams, BuildIndexElem)),
            ("including",    MapList(s.IndexIncludingParams, BuildIndexElem)),
            ("unique",       s.Unique       ? true : null),
            ("concurrent",   s.Concurrent   ? true : null),
            ("ifNotExists",  s.IfNotExists  ? true : null),
            ("accessMethod", string.IsNullOrEmpty(s.AccessMethod) || s.AccessMethod == "btree" ? null : s.AccessMethod),
            ("where",        BuildExpr(s.WhereClause)),
            ("nullsNotDistinct", s.NullsNotDistinct ? true : null),
            ("options",      StorageOptions(s.Options)),
            ("tablespace",   Ident.QuoteOpt(s.TableSpace))
        ));

    private SqlNode BuildDrop(DropStmt s, int start, int end) {
        var objectType = ObjectTypeKw(s.RemoveType);
        var first = s.Objects.FirstOrDefault();
        List<string>? parts = first?.NodeCase == Node.NodeOneofCase.List && first.List.Items.All(i => i.NodeCase == Node.NodeOneofCase.String)
            ? first.List.Items.Select(i => i.String.Sval).ToList()
            : null;
        (string key, object? value)[] target = s.RemoveType switch {
            // DROP TRIGGER tr ON s.t: the list is the table's name, then the trigger's
            ObjectType.ObjectTrigger or ObjectType.ObjectPolicy or ObjectType.ObjectRule when parts is { Count: >= 2 } =>
                new (string, object?)[] {
                    ("names",   new List<string> { Ident.Quote(parts[^1]) }),
                    ("onTable", Ident.Qualified(parts.Take(parts.Count - 1))),
                },
            // DROP OPERATOR CLASS oc USING btree: the access method comes first
            ObjectType.ObjectOpclass or ObjectType.ObjectOpfamily when parts is { Count: >= 2 } =>
                new (string, object?)[] {
                    ("names", new List<string> { Ident.Qualified(parts.Skip(1)) }),
                    ("using", Ident.Quote(parts[0])),
                },
            // DROP CAST (source AS target)
            ObjectType.ObjectCast when first?.List?.Items is { Count: 2 } cast =>
                new (string, object?)[] {
                    ("castSource", BuildPgTypeName(cast[0].TypeName)),
                    ("castTarget", BuildPgTypeName(cast[1].TypeName)),
                },
            // DROP TRANSFORM FOR type LANGUAGE lang
            ObjectType.ObjectTransform when first?.List?.Items is { Count: 2 } tr =>
                new (string, object?)[] {
                    ("transformType",     BuildPgTypeName(tr[0].TypeName)),
                    ("transformLanguage", Ident.Quote(tr[1].String.Sval)),
                },
            _ => new (string, object?)[] { ("names", DropNames(s, objectType)) },
        };
        var props = BuildProps(
            ("objectType", objectType),
            ("ifExists",   s.MissingOk ? true : null),
            ("concurrent", s.Concurrent ? true : null),
            ("cascade",    s.Behavior == DropBehavior.DropCascade ? true : null)
        );
        foreach (var (key, value) in target) if (value != null) props[key] = value;
        return new SqlNode("DropStatement", start, end, null, props);
    }

    private object? DropNames(DropStmt s, string objectType) {
        var names = s.Objects.Select(o => o.NodeCase switch {
            // Usually a dotted-identifier list (schema.name), but DROP CAST / DROP
            // OPERATOR CLASS/FAMILY wrap TypeName items here instead of String items —
            // fail loudly rather than silently filtering them out to an empty name.
            Node.NodeOneofCase.List => string.Join(".", o.List.Items.Select(n => n.NodeCase switch {
                Node.NodeOneofCase.String => Ident.Quote(n.String.Sval),
                _ => throw NotSupported($"DROP {objectType} name part ({n.NodeCase})", TryGetLocation(GetOneofValue(n))),
            })),
            // DROP AGGREGATE a(*): an aggregate over no arguments
            Node.NodeOneofCase.ObjectWithArgs when s.RemoveType == ObjectType.ObjectAggregate
                && o.ObjectWithArgs is { ArgsUnspecified: false, Objargs.Count: 0 } agg => $"{OwaName(agg.Objname)}(*)",
            Node.NodeOneofCase.ObjectWithArgs => OwaSignature(o.ObjectWithArgs),
            // DROP TYPE / DOMAIN: a type name, printed as types are everywhere else
            Node.NodeOneofCase.TypeName => BuildPgTypeName(o.TypeName),
            Node.NodeOneofCase.String => Ident.Quote(o.String.Sval),
            _ => throw NotSupported($"DROP {objectType} object ({o.NodeCase})", TryGetLocation(GetOneofValue(o))),
        }).Where(n => !string.IsNullOrEmpty(n)).ToList();
        return MaybeList(names);
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
            Node.NodeOneofCase.XmlExpr              => BuildXmlExpr(node.XmlExpr),
            Node.NodeOneofCase.XmlSerialize         => BuildXmlSerialize(node.XmlSerialize),
            Node.NodeOneofCase.JsonFuncExpr         => BuildJsonFuncExpr(node.JsonFuncExpr),
            // JSON constructors — SQL/JSON (PostgreSQL 16+)
            Node.NodeOneofCase.JsonObjectConstructor => BuildJsonObjectConstructor(node.JsonObjectConstructor),
            Node.NodeOneofCase.JsonArrayConstructor  => BuildJsonArrayConstructor(node.JsonArrayConstructor),
            Node.NodeOneofCase.JsonObjectAgg         => BuildJsonObjectAgg(node.JsonObjectAgg),
            Node.NodeOneofCase.JsonArrayAgg          => BuildJsonArrayAgg(node.JsonArrayAgg),
            // Unknown expression: fail loudly rather than silently drop or mislabel it.
            _ => throw NotSupported($"expression ({node.NodeCase})", TryGetLocation(GetOneofValue(node))),
        };
    }

    // Returns whichever submessage a Node oneof is currently holding, e.g. node.FuncCall
    // when node.NodeCase == FuncCall. The property name always matches the case name.
    private static object? GetOneofValue(Node node) =>
        typeof(Node).GetProperty(node.NodeCase.ToString())?.GetValue(node);

    // libpg_query represents `x LIKE p ESCAPE e` as `x LIKE like_escape(p, e)` and
    // `x SIMILAR TO p [ESCAPE e]` as `x SIMILAR TO similar_to_escape(p[, e])`.
    // Returns the bare pattern and puts the ESCAPE expression, if any, in `escape`.
    private static Node? UnwrapEscape(Node? node, string wrapper, out Node? escape) {
        escape = null;
        if (node?.NodeCase != Node.NodeOneofCase.FuncCall) return node;
        var fc = node.FuncCall;
        if (fc.Funcname.LastOrDefault()?.String?.Sval != wrapper || fc.Args.Count == 0) return node;
        if (fc.Args.Count > 1) escape = fc.Args[1];
        return fc.Args[0];
    }

    private SqlNode BuildAConst(A_Const c) {
        if (c.Isnull) return new SqlNode("Literal", 0, 0, "null", null);
        string? text = c.ValCase switch {
            A_Const.ValOneofCase.Ival => c.Ival.Ival.ToString(),
            A_Const.ValOneofCase.Fval => c.Fval.Fval,
            A_Const.ValOneofCase.Sval => $"'{c.Sval.Sval.Replace("'", "''")}'",
            A_Const.ValOneofCase.Boolval => c.Boolval.Boolval ? "true" : "false",
            // Unknown constant kind (e.g. bit-string BsVal): fail loudly rather than
            // silently drop the literal — this previously vanished with no trace at all.
            _ => throw NotSupported($"constant ({c.ValCase})", c.Location),
        };
        return new SqlNode("Literal", 0, 0, text, null);
    }

    private static SqlNode BuildColumnRef(ColumnRef c) {
        var parts = c.Fields.Select(f => f.NodeCase switch {
            Node.NodeOneofCase.String => Ident.Quote(f.String.Sval),
            Node.NodeOneofCase.AStar => "*",
            _ => "",
        });
        return new SqlNode("ColumnRef", 0, 0, null, new() { ["name"] = string.Join(".", parts) });
    }

    /// <summary>
    /// An operator as written: `+`, or OPERATOR(pg_catalog.+) when schema-qualified —
    /// which also takes the generic operator precedence, as the printer gives any
    /// unknown operator.
    /// </summary>
    private static string OperatorName(IList<Node> name) =>
        name.Count == 1
            ? name[0].String.Sval
            : $"OPERATOR({string.Join(".", name.SkipLast(1).Select(n => Ident.Quote(n.String.Sval)).Append(name[^1].String.Sval))})";

    private SqlNode BuildAExpr(A_Expr e) {
        var op = e.Name.Count > 0 ? OperatorName(e.Name) : "?";

        return e.Kind switch {
            // LIKE / NOT LIKE
            A_Expr_Kind.AexprLike or A_Expr_Kind.AexprIlike => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op", op switch { "~~" => "LIKE", "!~~" => "NOT LIKE", "~~*" => "ILIKE", "!~~*" => "NOT ILIKE", _ => op }),
                ("left",   BuildExpr(e.Lexpr)),
                ("right",  BuildExpr(UnwrapEscape(e.Rexpr, "like_escape", out var likeEscape))),
                ("escape", likeEscape != null ? BuildExpr(likeEscape) : null)
            )),

            // SIMILAR TO — libpg_query always wraps the RHS in similar_to_escape(pattern[, escape])
            A_Expr_Kind.AexprSimilar => new SqlNode("BinaryExpr", 0, 0, null, BuildProps(
                ("op",     op == "!~" ? "NOT SIMILAR TO" : "SIMILAR TO"),
                ("left",   BuildExpr(e.Lexpr)),
                ("right",  BuildExpr(UnwrapEscape(e.Rexpr, "similar_to_escape", out var similarEscape))),
                ("escape", similarEscape != null ? BuildExpr(similarEscape) : null)
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
        var name = Ident.QualifiedFunc(f.Funcname.Select(n => n.String.Sval));
        return new SqlNode("FunctionCall", 0, 0, null, BuildProps(
            ("name",     name),
            // Written in SQL-standard syntax (TRIM(LEADING FROM x), EXTRACT(...), ...)
            // rather than as a call to the pg_catalog function it maps to
            ("sqlSyntax", f.Funcformat == CoercionForm.CoerceSqlSyntax ? true : null),
            ("args",     MapList(f.Args, BuildExpr)),
            ("star",     f.AggStar     ? true : null),
            ("distinct", f.AggDistinct ? true : null),
            ("aggOrder", MapList(f.AggOrder, BuildExpr)),
            // percentile_cont(0.5) WITHIN GROUP (ORDER BY x): aggOrder is the WITHIN GROUP order
            ("withinGroup", f.AggWithinGroup ? true : null),
            ("filter",   f.AggFilter != null ? BuildExpr(f.AggFilter) : null),
            ("over",     BuildOver(f.Over))
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
        // current_timestamp(0), localtime(3): the _N forms carry a precision
        return new SqlNode("SqlvalueFunction", 0, 0, f.Typmod >= 0 ? $"{name}({f.Typmod})" : name, null);
    }

    // OVER (...) — or a named window reference, OVER w: Name set, no partition/order/frame
    private SqlNode? BuildOver(WindowDef? over) =>
        over == null ? null
        : !string.IsNullOrEmpty(over.Name) && over.PartitionClause.Count == 0
            && over.OrderClause.Count == 0 && (over.FrameOptions & 0x00001) == 0
            ? new SqlNode("WindowRef", 0, 0, Ident.Quote(over.Name), null)
            : BuildWindowDef(over);

    // Clauses shared by the SQL/JSON constructors. `onNull` is set only when it differs
    // from the constructor's default: NULL ON NULL for objects, ABSENT ON NULL for arrays.
    private (string, object?)[] JsonConstructorProps(JsonOutput? output, bool absentOnNull, bool absentByDefault) => new (string, object?)[] {
        ("returning", output?.TypeName != null ? BuildPgTypeName(output.TypeName) + JsonFormatClause(output.Returning?.Format) : null),
        ("onNull",    absentOnNull == absentByDefault ? null : absentOnNull ? "ABSENT ON NULL" : "NULL ON NULL"),
    };

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

        // EXCLUDE CURRENT ROW / GROUP / TIES
        string? frameExclude =
            (fo & 0x08000) != 0 ? "EXCLUDE CURRENT ROW"
            : (fo & 0x10000) != 0 ? "EXCLUDE GROUP"
            : (fo & 0x20000) != 0 ? "EXCLUDE TIES"
            : null;

        return new SqlNode("WindowDef", 0, 0, null, BuildProps(
            ("name",         string.IsNullOrEmpty(w.Name)    ? null : Ident.Quote(w.Name)),
            ("refname",      string.IsNullOrEmpty(w.Refname) ? null : Ident.Quote(w.Refname)),
            ("partitionBy",  MapList(w.PartitionClause, BuildExpr)),
            ("orderBy",      MapList(w.OrderClause, BuildExpr)),
            ("frameMode",    frameMode),
            ("frameStart",   frameStart),
            ("startOffset",  w.StartOffset != null ? BuildExpr(w.StartOffset) : null),
            ("frameEnd",     frameEnd),
            ("endOffset",    w.EndOffset != null ? BuildExpr(w.EndOffset) : null),
            ("frameExclude", frameExclude)
        ));
    }

    private SqlNode BuildTypeCast(TypeCast t) {
        var typeName = t.TypeName != null ? BuildPgTypeName(t.TypeName) : null;
        var arg      = BuildExpr(t.Arg);

        // INTERVAL 'value' or INTERVAL 'value' field_modifier — the typed-literal form
        // only takes a string constant; anything else stays a cast, x::interval day
        var isInterval = t.TypeName?.Names.Count == 2
            && t.TypeName.Names[0].String?.Sval == "pg_catalog" && t.TypeName.Names[1].String?.Sval == "interval";
        var isStringConst = t.Arg?.NodeCase == Node.NodeOneofCase.AConst && t.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval;
        if (typeName != null && isInterval && isStringConst && (typeName == "interval" || typeName.StartsWith("interval "))) {
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
            SubLinkType.ArraySublink => "ARRAY",
            SubLinkType.RowcompareSublink => "ROWCOMPARE",
            _ => s.SubLinkType.ToString(),
        };
        var subquery = s.Subselect?.NodeCase == Node.NodeOneofCase.SelectStmt
            ? BuildSelect(s.Subselect.SelectStmt, 0, _sql.Length)
            : null;
        var testexpr = s.Testexpr != null ? BuildExpr(s.Testexpr) : null;
        // IN (subquery) has no operator; = ANY, < ALL, OPERATOR(s.=) ANY name theirs
        var op = s.OperName.Count > 0 ? OperatorName(s.OperName) : null;
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
            ("test", t.Booltesttype switch {
                BoolTestType.IsTrue       => "TRUE",
                BoolTestType.IsNotTrue    => "NOT TRUE",
                BoolTestType.IsFalse      => "FALSE",
                BoolTestType.IsNotFalse   => "NOT FALSE",
                BoolTestType.IsUnknown    => "UNKNOWN",
                BoolTestType.IsNotUnknown => "NOT UNKNOWN",
                _ => throw NotSupported($"boolean test ({t.Booltesttype})", t.Location),
            })
        ));

    private SqlNode BuildRowExpr(RowExpr r) =>
        new("RowExpr", 0, 0, null, BuildProps(
            ("args", MapList(r.Args, BuildExpr)),
            // ROW(a, b) rather than (a, b) — and ROW(a) has no keyword-free form
            ("explicit", r.RowFormat == CoercionForm.CoerceExplicitCall ? true : null)
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
                // ORDER BY x USING <
                SortByDir.SortbyUsing => $"USING {string.Join(".", s.UseOp.Select(o => o.String.Sval))}",
                _ => null,
            }),
            ("nulls", s.SortbyNulls switch {
                SortByNulls.First => "NULLS FIRST",
                SortByNulls.Last  => "NULLS LAST",
                _ => null,
            })
        ));

    private SqlNode BuildResTarget(ResTarget r) =>
        new("ResTarget", 0, 0, null, BuildProps(
            ("name", Ident.QuoteOpt(r.Name)),
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
        Node.NodeOneofCase.RangeTableFunc   => BuildRangeTableFunc(n.RangeTableFunc),
        Node.NodeOneofCase.JsonTable        => BuildJsonTable(n.JsonTable),
        // Unknown FROM item: fail loudly rather than silently drop or mislabel it.
        _ => throw NotSupported($"FROM item ({n.NodeCase})", TryGetLocation(GetOneofValue(n))),
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
            ("schema", Ident.QuoteOpt(r.Schemaname)),
            ("name", Ident.QuoteOpt(r.Relname)),
            ("alias", Ident.QuoteOpt(r.Alias?.Aliasname)),
            ("aliasColumns", AliasColumns(r.Alias)),
            // Inh is false only for `ONLY t`: exclude inheritance children / partitions
            ("only", r.Inh ? null : true)
        ));
    }

    private SqlNode BuildJoinExpr(JoinExpr j) {
        string joinType;
        if (j.IsNatural) {
            // NATURAL LEFT JOIN is an outer join: keep the type, not just NATURAL
            joinType = j.Jointype switch {
                JoinType.JoinLeft  => "NATURAL LEFT",
                JoinType.JoinRight => "NATURAL RIGHT",
                JoinType.JoinFull  => "NATURAL FULL",
                _                  => "NATURAL",
            };
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
                    .Select(n => Ident.Quote(n.String.Sval)).ToList()
                : null),
            // JOIN ... USING (id) AS j
            ("usingAlias", Ident.QuoteOpt(j.JoinUsingAlias?.Aliasname)),
            // (a JOIN b ...) AS j: an alias on the whole join
            ("alias",        Ident.QuoteOpt(j.Alias?.Aliasname)),
            ("aliasColumns", AliasColumns(j.Alias))
        ));
    }

    private SqlNode BuildRangeSubselect(RangeSubselect r) {
        var subquery = r.Subquery?.NodeCase == Node.NodeOneofCase.SelectStmt
            ? BuildSelect(r.Subquery.SelectStmt, 0, _sql.Length)
            : null;
        return new SqlNode("Subquery", 0, 0, null, BuildProps(
            ("subquery", subquery),
            ("alias",    Ident.QuoteOpt(r.Alias?.Aliasname)),
            ("aliasColumns", AliasColumns(r.Alias)),
            ("lateral",  r.Lateral ? true : null)
        ));
    }

    // A function in FROM. Functions holds one (call, column definition list) pair per
    // function — several only for ROWS FROM (f(), g()); the per-function definition
    // list is ROWS FROM's `f() AS (a int)`. Coldeflist is the single-function form,
    // `f() AS r(a int)`.
    private SqlNode BuildRangeFunction(RangeFunction r) {
        var functions = MapList(r.Functions, n => {
            var items = n.NodeCase == Node.NodeOneofCase.List ? n.List.Items.ToList() : new List<Node> { n };
            if (items.Count == 0) return null;
            var defs = items.Count > 1 && items[1].NodeCase == Node.NodeOneofCase.List ? items[1].List.Items : null;
            return new SqlNode("RangeFunctionItem", 0, 0, null, BuildProps(
                ("call",       BuildExpr(items[0])),
                ("columnDefs", defs != null ? MapList(defs, BuildTableElement) : null)
            ));
        });
        return new SqlNode("RangeFunction", 0, 0, null, BuildProps(
            ("functions",    functions),
            ("rowsFrom",     r.IsRowsfrom ? true : null),
            ("ordinality",   r.Ordinality ? true : null),
            ("lateral",      r.Lateral ? true : null),
            ("alias",        Ident.QuoteOpt(r.Alias?.Aliasname)),
            ("aliasColumns", AliasColumns(r.Alias)),
            ("columnDefs",   MapList(r.Coldeflist, BuildTableElement))
        ));
    }

    // Column names of a table alias: the `(a, b)` of `AS x(a, b)`.
    private static object? AliasColumns(Alias? alias) =>
        alias == null ? null : MaybeList(alias.Colnames
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => Ident.Quote(n.String.Sval))
            .ToList());

    // -------------------------------------------------------------------------
    // WITH / CTEs
    // -------------------------------------------------------------------------

    private SqlNode BuildWithClause(WithClause w) {
        var ctes = MapList(w.Ctes, n => {
            if (n.NodeCase != Node.NodeOneofCase.CommonTableExpr) return null;
            var cte = n.CommonTableExpr;
            SqlNode? query = cte.Ctequery != null ? TryBuildDmlQuery(cte.Ctequery) : null;
            if (cte.Ctequery != null && query == null)
                throw NotSupported($"CTE query ({cte.Ctequery.NodeCase})", TryGetLocation(GetOneofValue(cte.Ctequery)));

            SqlNode? search = null;
            if (cte.SearchClause != null) {
                var sc = cte.SearchClause;
                var cols = sc.SearchColList
                    .Select(c => c.NodeCase == Node.NodeOneofCase.String ? c.String.Sval
                        : c.NodeCase == Node.NodeOneofCase.ColumnRef && c.ColumnRef.Fields.Count > 0
                            && c.ColumnRef.Fields[0].NodeCase == Node.NodeOneofCase.String
                            ? c.ColumnRef.Fields[0].String.Sval : null)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .Select(s => Ident.Quote(s!))
                    .ToList();
                search = new SqlNode("CTESearch", 0, 0, null, BuildProps(
                    ("breadthFirst", sc.SearchBreadthFirst ? true : null),
                    ("columns",      MaybeList(cols)),
                    ("seqColumn",    Ident.QuoteOpt(sc.SearchSeqColumn))
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
                    .Select(s => Ident.Quote(s!))
                    .ToList();
                cycle = new SqlNode("CTECycle", 0, 0, null, BuildProps(
                    ("columns",    MaybeList(cols)),
                    ("markColumn", Ident.QuoteOpt(cc.CycleMarkColumn)),
                    ("pathColumn", Ident.QuoteOpt(cc.CyclePathColumn))
                ));
            }

            return new SqlNode("CTE", 0, 0, null, BuildProps(
                ("name",   Ident.Quote(cte.Ctename)),
                ("materialized", cte.Ctematerialized switch {
                    CTEMaterialize.Always => "MATERIALIZED",
                    CTEMaterialize.Never  => "NOT MATERIALIZED",
                    _                     => null,
                }),
                ("columns", MaybeList(cte.Aliascolnames
                    .Where(c => c.NodeCase == Node.NodeOneofCase.String)
                    .Select(c => Ident.Quote(c.String.Sval))
                    .ToList())),
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
            // ON CONFLICT (col) WHERE pred: matches a partial unique index
            ("where",      BuildExpr(i.WhereClause)),
            ("constraint", Ident.QuoteOpt(i.Conname))
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

    // TableLikeOption bits (parsenodes.h). The grammar folds a whole
    // "INCLUDING x EXCLUDING y ..." clause list into one options mask — INCLUDING
    // ORs the bit in, EXCLUDING ANDs it out (options = (options | inc) & ~exc) — so
    // the mask alone doesn't remember the original clause sequence. We only need to
    // reproduce that final mask, so we reconstruct *some* clause list that yields it:
    // list each known bit that's set as its own INCLUDING, unless a bit outside the
    // known set is set (only possible via INCLUDING ALL, which sets every bit,
    // including ones this list doesn't know about) — then emit INCLUDING ALL plus
    // EXCLUDING for each known bit that ended up cleared.
    private static readonly (uint bit, string name)[] TableLikeOptions = {
        (0x0001, "COMMENTS"),
        (0x0002, "COMPRESSION"),
        (0x0004, "CONSTRAINTS"),
        (0x0008, "DEFAULTS"),
        (0x0010, "GENERATED"),
        (0x0020, "IDENTITY"),
        (0x0040, "INDEXES"),
        (0x0080, "STATISTICS"),
        (0x0100, "STORAGE"),
    };

    private static SqlNode BuildTableLikeClause(TableLikeClause t) {
        var options = (uint)t.Options;
        uint knownMask = 0;
        foreach (var (bit, _) in TableLikeOptions) knownMask |= bit;

        var clauses = new List<string>();
        if ((options & ~knownMask) != 0) {
            clauses.Add("INCLUDING ALL");
            foreach (var (bit, name) in TableLikeOptions)
                if ((options & bit) == 0) clauses.Add("EXCLUDING " + name);
        } else {
            foreach (var (bit, name) in TableLikeOptions)
                if ((options & bit) != 0) clauses.Add("INCLUDING " + name);
        }
        return new SqlNode("TableLikeClause", 0, 0, null, BuildProps(
            ("relation", BuildRangeVar(t.Relation)),
            ("clauses",  MaybeList(clauses))
        ));
    }

    private SqlNode BuildColumnDef(ColumnDef columnDef) =>
        new("ColumnDef", 0, 0, null, BuildProps(
            ("name",        Ident.QuoteOpt(columnDef.Colname)),
            ("typeName",    columnDef.TypeName != null ? BuildPgTypeName(columnDef.TypeName) : null),
            ("collation",   columnDef.CollClause != null ? Ident.Qualified(columnDef.CollClause.Collname.Select(c => c.String.Sval)) : null),
            ("constraints", columnDef.Constraints.Count > 0
                ? (object?)columnDef.Constraints
                    .Where(n => n.NodeCase == Node.NodeOneofCase.Constraint)
                    .Select(n => BuildConstraint(n.Constraint))
                    .ToList()
                : null),
            // CREATE FOREIGN TABLE column-level OPTIONS (name 'value', ...)
            ("options", OptionsToObject(BuildDefElemOptions(columnDef.Fdwoptions)))
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
            ? (object?)constraint.Keys.Select(k => k.NodeCase == Node.NodeOneofCase.String ? Ident.Quote(k.String.Sval) : "").ToList()
            : null;

        // FK columns
        var fkAttrs = constraint.FkAttrs.Count > 0
            ? (object?)constraint.FkAttrs.Select(k => Ident.Quote(k.String.Sval)).ToList()
            : null;
        var pkAttrs = constraint.PkAttrs.Count > 0
            ? (object?)constraint.PkAttrs.Select(k => Ident.Quote(k.String.Sval)).ToList()
            : null;

        return new SqlNode("Constraint", 0, 0, null, BuildProps(
            ("contype",          contype),
            ("name",             Ident.QuoteOpt(constraint.Conname)),
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
            ("initDeferred",     constraint.Initdeferred ? true : null),
            ("notValid",         constraint.SkipValidation ? true : null),
            ("noInherit",        constraint.IsNoInherit ? true : null),
            // MATCH FULL / PARTIAL; 's' (SIMPLE) is the default
            ("fkMatch",          constraint.FkMatchtype switch { "f" => "FULL", "p" => "PARTIAL", _ => null }),
            // ON DELETE SET NULL (col, ...): only those columns are set
            ("fkDelSetCols",     MaybeList(constraint.FkDelSetCols.Select(k => (object?)Ident.Quote(k.String.Sval)).ToList())),
            // Index parameters of PRIMARY KEY / UNIQUE / EXCLUDE
            ("including",        MaybeList(constraint.Including.Select(k => (object?)Ident.Quote(k.String.Sval)).ToList())),
            ("indexOptions",     constraint.Contype == ConstrType.ConstrIdentity ? null : StorageOptions(constraint.Options)),
            ("indexSpace",       Ident.QuoteOpt(constraint.Indexspace)),
            // ADD PRIMARY KEY / UNIQUE USING INDEX existing_index
            ("indexName",        Ident.QuoteOpt(constraint.Indexname)),
            // GENERATED ... AS IDENTITY (START WITH 10 ...)
            ("identityOptions",  constraint.Contype == ConstrType.ConstrIdentity && ParseSeqOptions(constraint.Options) is { Count: > 0 } seqOpts
                ? seqOpts : null),
            ("accessMethod",     constraint.Contype == ConstrType.ConstrExclusion ? constraint.AccessMethod : null),
            ("exclusions",       MaybeList(constraint.Exclusions.Select(BuildExclusionElem).ToList())),
            ("where",            BuildExpr(constraint.WhereClause))
        ));
    }

    // EXCLUDE element: a (index element, operator) pair — (room WITH =, during WITH &&)
    private object? BuildExclusionElem(Node n) {
        var pair = n.List?.Items;
        if (pair == null || pair.Count != 2 || pair[0].NodeCase != Node.NodeOneofCase.IndexElem)
            throw NotSupported($"EXCLUDE element ({n.NodeCase})", null);
        var op = pair[1].List.Items.Select(i => i.String.Sval).ToList();
        return new SqlNode("ExclusionElem", 0, 0, null, BuildProps(
            ("elem", BuildIndexElem(pair[0])),
            // A schema-qualified operator needs the OPERATOR() syntax
            ("op",   op.Count == 1 ? op[0] : $"OPERATOR({string.Join(".", op.Take(op.Count - 1).Select(Ident.Quote).Append(op[^1]))})")
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
            // Anything else used to print its enum name (`changeowner`, `settablespace`):
            // invalid SQL. Fail loudly instead, like every other unmapped construct.
            _ => throw NotSupported($"ALTER TABLE subcommand ({cmd.Subtype})", null),
        };
        string? newType = null;
        if (cmd.Subtype == AlterTableType.AtAlterColumnType && cmd.Def?.NodeCase == Node.NodeOneofCase.ColumnDef
            && cmd.Def.ColumnDef.TypeName != null)
            newType = BuildPgTypeName(cmd.Def.ColumnDef.TypeName);

        return new SqlNode("AlterCmd", 0, 0, null, BuildProps(
            ("subtype", subtype),
            ("name",    Ident.QuoteOpt(cmd.Name)),
            ("newType", newType),
            // ALTER COLUMN a TYPE bigint USING a::bigint: how to convert existing values
            ("using",   cmd.Subtype == AlterTableType.AtAlterColumnType && cmd.Def?.ColumnDef?.RawDefault != null
                        ? BuildExpr(cmd.Def.ColumnDef.RawDefault) : null),
            ("expr",    cmd.Subtype == AlterTableType.AtColumnDefault && cmd.Def != null ? BuildExpr(cmd.Def) : null),
            ("def",     cmd.Subtype == AlterTableType.AtAddColumn && cmd.Def?.NodeCase == Node.NodeOneofCase.ColumnDef
                        ? BuildColumnDef(cmd.Def.ColumnDef)
                        : cmd.Subtype == AlterTableType.AtAddConstraint && cmd.Def?.NodeCase == Node.NodeOneofCase.Constraint
                        ? BuildConstraint(cmd.Def.Constraint)
                        : null),
            // MissingOk means IF NOT EXISTS for ADD COLUMN and IF EXISTS for the DROPs
            ("ifExists", cmd.MissingOk ? true : null),
            ("cascade",  cmd.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

    private SqlNode? BuildFunctionParam(Node n) {
        if (n.NodeCase != Node.NodeOneofCase.FunctionParameter) return null;
        var p = n.FunctionParameter;
        var mode = p.Mode switch {
            FunctionParameterMode.FuncParamIn       => "IN",
            FunctionParameterMode.FuncParamOut      => "OUT",
            FunctionParameterMode.FuncParamInout    => "INOUT",
            FunctionParameterMode.FuncParamVariadic => "VARIADIC",
            _                                        => null,
        };
        return new SqlNode("FunctionParam", 0, 0, null, BuildProps(
            ("name",     Ident.QuoteOpt(p.Name)),
            ("typeName", p.ArgType != null ? BuildPgTypeName(p.ArgType) : null),
            ("mode",     mode),
            ("default",  p.Defexpr != null ? BuildExpr(p.Defexpr) : null)
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
            ("name", Ident.QuoteOpt(ie.Name)),
            ("expr", expr),
            ("collation", ie.Collation.Count > 0 ? Ident.Qualified(ie.Collation.Select(c => c.String.Sval)) : null),
            // Operator class: text_pattern_ops makes the index usable for LIKE 'x%'
            ("opclass",   ie.Opclass.Count > 0 ? Ident.Qualified(ie.Opclass.Select(c => c.String.Sval)) : null),
            ("direction", dir),
            ("nulls", ie.NullsOrdering switch {
                SortByNulls.First => "NULLS FIRST",
                SortByNulls.Last  => "NULLS LAST",
                _ => null,
            })
        ));
    }

    // Types written with SQL keywords (`integer`, `double precision`, `char(3)`, …)
    // parse to pg_catalog.<internal name>; print those back in keyword form. A bare
    // internal name such as `int4` or `float8` has no pg_catalog prefix in the tree and
    // is printed as written — rewriting it would resolve through a different path.
    private static readonly Dictionary<string, string> _sqlTypeNames = new() {
        ["int2"]        = "smallint",
        ["int4"]        = "integer",
        ["int8"]        = "bigint",
        ["float4"]      = "real",
        ["float8"]      = "double precision",
        ["numeric"]     = "numeric",
        ["bool"]        = "boolean",
        ["bit"]         = "bit",
        ["varbit"]      = "bit varying",
        ["bpchar"]      = "char",
        ["varchar"]     = "varchar",
        ["timestamp"]   = "timestamp",
        ["timestamptz"] = "timestamp with time zone",
        ["time"]        = "time",
        ["timetz"]      = "time with time zone",
        ["interval"]    = "interval",
        ["json"]        = "json",
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

    private string BuildPgTypeName(TypeName t) {
        var parts = t.Names.Select(n => n.String.Sval).ToList();
        // `char` and `bit` written without a length mean length 1, so the unbounded
        // pg_catalog.bpchar / pg_catalog.bit (no typmod) can't use the keyword form
        var isSqlType = parts.Count == 2 && parts[0] == "pg_catalog" && _sqlTypeNames.ContainsKey(parts[1])
            && !(parts[1] is "bpchar" or "bit" && t.Typmods.Count == 0);
        var baseName = isSqlType ? _sqlTypeNames[parts[1]] : Ident.QualifiedType(parts);

        var mods = t.Typmods
            .Select(m => m.NodeCase switch {
                Node.NodeOneofCase.Integer => m.Integer.Ival.ToString(),
                Node.NodeOneofCase.AConst when m.AConst.ValCase == A_Const.ValOneofCase.Ival => m.AConst.Ival.Ival.ToString(),
                Node.NodeOneofCase.AConst when m.AConst.ValCase == A_Const.ValOneofCase.Fval => m.AConst.Fval.Fval,
                Node.NodeOneofCase.AConst when m.AConst.ValCase == A_Const.ValOneofCase.Sval => $"'{m.AConst.Sval.Sval.Replace("'", "''")}'",
                Node.NodeOneofCase.ColumnRef => string.Join(".", m.ColumnRef.Fields.Select(f => Ident.Quote(f.String.Sval))),
                _ => throw NotSupported($"type modifier ({m.NodeCase})", TryGetLocation(GetOneofValue(m))),
            })
            .ToList();

        string name;
        if (isSqlType && parts[1] == "interval" && mods.Count > 0) {
            // INTERVAL typmods: a field-range bitmask (INTERVAL_FULL_RANGE, 32767, when no
            // fields were given — interval(3)), then an optional precision
            name = !int.TryParse(mods[0], out var mask) ? throw NotSupported($"interval fields ({mods[0]})", null)
                : mask == 32767 ? "interval"
                : _intervalMasks.TryGetValue(mask, out var fields) ? $"interval {fields}"
                : throw NotSupported($"interval fields ({mods[0]})", null);
            if (mods.Count > 1) name += $"({mods[1]})";
        } else {
            var modList = mods.Count > 0 ? $"({string.Join(", ", mods)})" : "";
            // The precision goes before WITH TIME ZONE: timestamp(3) with time zone
            name = isSqlType && baseName.EndsWith(" with time zone")
                ? baseName.Replace(" with time zone", modList + " with time zone")
                : baseName + modList;
        }

        // Array bounds: -1 for an unsized dimension, `int[]`; otherwise `int[3]`
        foreach (var b in t.ArrayBounds)
            name += b.NodeCase == Node.NodeOneofCase.Integer && b.Integer.Ival >= 0 ? $"[{b.Integer.Ival}]" : "[]";

        // RETURNS SETOF t: a set-returning function, not one returning a single t
        return t.Setof ? $"setof {name}" : name;
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
                    return new SqlNode("FieldAccess", 0, 0, Ident.Quote(n.String.Sval), null);
                // (f(x)).*: every field of a composite value
                if (n.NodeCase == Node.NodeOneofCase.AStar)
                    return new SqlNode("FieldAccess", 0, 0, "*", null);
                throw NotSupported($"indirection ({n.NodeCase})", TryGetLocation(GetOneofValue(n)));
            })
            .ToList();
        return new SqlNode("Subscript", 0, 0, null, BuildProps(
            ("arg",        BuildExpr(a.Arg)),
            ("subscripts", MaybeList(subscripts))
        ));
    }

    private SqlNode BuildNamedArgExpr(NamedArgExpr n) =>
        new("NamedArg", 0, 0, null, BuildProps(
            ("name", Ident.Quote(n.Name)),
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
            ("savepoint", Ident.QuoteOpt(t.SavepointName)),
            ("gid",       string.IsNullOrEmpty(t.Gid) ? null : t.Gid),
            ("options",   MaybeList(options)),
            // COMMIT AND CHAIN: start a new transaction with the same characteristics
            ("chain",     t.Chain ? true : null)
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
            var vals = v.Args.Select(SetValue).ToList();
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

    // Formats one SET / ALTER SYSTEM SET value as SQL text. A string value prints
    // bare when that reads back identically, otherwise as a single-quoted literal:
    // `"MySchema"` and `'MySchema'` both parse to the string MySchema, and must not
    // print as bare `MySchema`, which would fold to `myschema`.
    private string SetValue(Node a) {
        if (a.NodeCase == Node.NodeOneofCase.TypeCast && a.TypeCast.Arg != null) a = a.TypeCast.Arg;
        if (a.NodeCase != Node.NodeOneofCase.AConst) throw NotSupported($"SET value ({a.NodeCase})", TryGetLocation(GetOneofValue(a)));
        return a.AConst.ValCase switch {
            A_Const.ValOneofCase.Ival => a.AConst.Ival.Ival.ToString(),
            A_Const.ValOneofCase.Fval => a.AConst.Fval.Fval,
            A_Const.ValOneofCase.Sval => a.AConst.Sval.Sval is "on" or "true" or "false" || Ident.Quote(a.AConst.Sval.Sval) == a.AConst.Sval.Sval
                ? a.AConst.Sval.Sval
                : $"'{a.AConst.Sval.Sval.Replace("'", "''")}'",
            _ => throw NotSupported($"SET value ({a.AConst.ValCase})", a.AConst.Location),
        };
    }

    private static SqlNode BuildVariableShow(VariableShowStmt v, int start, int end) =>
        new("VariableShowStatement", start, end, null, BuildProps(("name", v.Name)));

    private SqlNode BuildGrant(GrantStmt g, int start, int end) {
        // A column list restricts the privilege to those columns: INSERT (a, b)
        var privs = g.Privileges
            .Where(p => p.NodeCase == Node.NodeOneofCase.AccessPriv)
            .Select(p => new SqlNode("Privilege", 0, 0, null, BuildProps(
                ("name",    string.IsNullOrEmpty(p.AccessPriv.PrivName) ? "ALL PRIVILEGES" : p.AccessPriv.PrivName.ToUpper()),
                ("columns", MaybeList(p.AccessPriv.Cols
                    .Where(c => c.NodeCase == Node.NodeOneofCase.String)
                    .Select(c => Ident.Quote(c.String.Sval))
                    .ToList()))
            )))
            .ToList();

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
            Node.NodeOneofCase.String         => new SqlNode("Literal", 0, 0, Ident.Quote(o.String.Sval), null),
            Node.NodeOneofCase.ObjectWithArgs => new SqlNode("Literal", 0, 0,
                OwaSignature(o.ObjectWithArgs), null),
            _ => null,
        }).OfType<SqlNode>().ToList();

        var grantees = g.Grantees
            .Where(gr => gr.NodeCase == Node.NodeOneofCase.RoleSpec)
            .Select(gr => RoleSpecName(gr.RoleSpec))
            .ToList();

        return new SqlNode(g.IsGrant ? "GrantStatement" : "RevokeStatement", start, end, null, BuildProps(
            ("privs",       MaybeList(privs)),
            ("objtype",     objtypeStr),
            ("objects",     MaybeList(objects)),
            ("grantees",    MaybeList(grantees)),
            // WITH GRANT OPTION on GRANT; GRANT OPTION FOR (revoke only the grant option) on REVOKE
            ("grantOption", g.GrantOption ? true : null),
            ("grantedBy",   g.Grantor != null ? RoleSpecName(g.Grantor) : null),
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
            ("name",     Ident.QuoteOpt(c.Role)),
            ("options",  ParseRoleOptions(c.Options) is { Count: > 0 } options ? (object?)options : null)
        ));
    }

    private static SqlNode BuildAlterRole(AlterRoleStmt ar, int start, int end) =>
        new("AlterRoleStatement", start, end, null, BuildProps(
            ("name",    Ident.QuoteOpt(ar.Role?.Rolename) ?? ""),
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
                    result.Add(pwd != null ? $"PASSWORD '{pwd.Replace("'", "''")}'" : "PASSWORD NULL");
                    break;
                case "connectionlimit":
                    result.Add($"CONNECTION LIMIT {defElem.Arg?.Integer?.Ival ?? -1}");
                    break;
                case "validUntil":
                    var until = defElem.Arg?.NodeCase == Node.NodeOneofCase.String ? defElem.Arg.String.Sval : null;
                    result.Add(until != null ? $"VALID UNTIL '{until.Replace("'", "''")}'" : "VALID UNTIL NULL");
                    break;
                case "sysid":
                    if (defElem.Arg?.NodeCase == Node.NodeOneofCase.Integer)
                        result.Add($"SYSID {defElem.Arg.Integer.Ival}");
                    break;
                // ROLE role_list — roles made members of this (new/altered) role
                case "rolemembers":
                    result.Add("ROLE " + RoleListText(defElem.Arg));
                    break;
                // ADMIN role_list — members added with admin option
                case "adminmembers":
                    result.Add("ADMIN " + RoleListText(defElem.Arg));
                    break;
                // IN ROLE / IN GROUP role_list — this role becomes a member of these
                case "addroleto":
                    result.Add("IN ROLE " + RoleListText(defElem.Arg));
                    break;
            }
        }
        return result;
    }

    private static string RoleListText(Node? arg) =>
        arg?.NodeCase == Node.NodeOneofCase.List
            ? string.Join(", ", arg.List.Items
                .Where(n => n.NodeCase == Node.NodeOneofCase.RoleSpec)
                .Select(n => RoleSpecName(n.RoleSpec)))
            : "";

    // ALTER <kind> [IF EXISTS] <target> RENAME [COLUMN|CONSTRAINT|ATTRIBUTE old] TO new
    private SqlNode BuildRename(RenameStmt r, int start, int end) {
        string kind;
        string? target;
        string? sub = null;
        string? onTable = null;
        string? usingMethod = null;
        bool only = false;
        var relation = r.Relation != null ? RangeVarQualifiedName(r.Relation) : null;

        switch (r.RenameType) {
            // Parts of a relation: ALTER TABLE t RENAME COLUMN a TO b, ... RENAME CONSTRAINT
            case ObjectType.ObjectColumn:
            case ObjectType.ObjectTabconstraint:
                // RENAME CONSTRAINT leaves relationType unset: only ALTER TABLE has it
                kind = r.RenameType == ObjectType.ObjectColumn ? ObjectTypeKw(r.RelationType) : "TABLE";
                target = relation;
                only = !r.Relation.Inh;
                sub = r.RenameType == ObjectType.ObjectColumn ? "COLUMN" : "CONSTRAINT";
                break;
            // ALTER TYPE t RENAME ATTRIBUTE a TO b
            case ObjectType.ObjectAttribute:
                kind = "TYPE";
                target = relation;
                sub = "ATTRIBUTE";
                break;
            case ObjectType.ObjectDomconstraint:
                kind = "DOMAIN";
                target = NodeObjName(r.Object);
                sub = "CONSTRAINT";
                break;
            // Named per table: ALTER TRIGGER tr ON t RENAME TO tr2
            case ObjectType.ObjectTrigger:
            case ObjectType.ObjectPolicy:
            case ObjectType.ObjectRule:
                kind = ObjectTypeKw(r.RenameType);
                target = Ident.Quote(r.Subname);
                onTable = relation;
                break;
            // Relations: ALTER TABLE [IF EXISTS] [ONLY] t RENAME TO u
            case ObjectType.ObjectTable:
            case ObjectType.ObjectForeignTable:
            case ObjectType.ObjectIndex:
            case ObjectType.ObjectView:
            case ObjectType.ObjectMatview:
            case ObjectType.ObjectSequence:
                kind = ObjectTypeKw(r.RenameType);
                target = relation;
                only = !r.Relation.Inh;
                break;
            // Named by a bare identifier held in subname
            case ObjectType.ObjectDatabase:
            case ObjectType.ObjectRole:
            case ObjectType.ObjectSchema:
            case ObjectType.ObjectTablespace:
                kind = ObjectTypeKw(r.RenameType);
                target = Ident.Quote(r.Subname);
                break;
            // ALTER OPERATOR CLASS name USING method: the method comes first in the list
            case ObjectType.ObjectOpclass:
            case ObjectType.ObjectOpfamily: {
                var parts = r.Object.List.Items.Select(i => i.String.Sval).ToList();
                kind = ObjectTypeKw(r.RenameType);
                target = Ident.Qualified(parts.Skip(1));
                usingMethod = Ident.Quote(parts[0]);
                break;
            }
            case ObjectType.ObjectAggregate when r.Object?.ObjectWithArgs is { ArgsUnspecified: false, Objargs.Count: 0 } agg:
                kind = "AGGREGATE";
                target = $"{OwaName(agg.Objname)}(*)";
                break;
            default:
                kind = ObjectTypeKw(r.RenameType);
                target = NodeObjName(r.Object) ?? throw NotSupported($"RENAME target ({r.RenameType})", null);
                break;
        }

        return new SqlNode("RenameStatement", start, end, null, BuildProps(
            ("kind",     kind),
            ("ifExists", r.MissingOk ? true : null),
            // ONLY: rename in this table, not its inheritance children
            ("only",     only ? true : null),
            ("target",   target),
            ("onTable",  onTable),
            ("using",    usingMethod),
            ("sub",      sub),
            ("oldName",  sub != null ? Ident.Quote(r.Subname) : null),
            ("newName",  Ident.Quote(r.Newname)),
            ("cascade",  r.Behavior == DropBehavior.DropCascade ? true : null)
        ));
    }

    private SqlNode BuildCreateCompositeType(CompositeTypeStmt ct, int start, int end) =>
        new("CreateTypeStatement", start, end, null, BuildProps(
            ("kind",     "COMPOSITE"),
            ("typeName", ct.Typevar == null ? null
                : Ident.Qualified(new[] { ct.Typevar.Schemaname, ct.Typevar.Relname }.Where(p => !string.IsNullOrEmpty(p)))),
            ("columns",  ct.Coldeflist.Count > 0
                ? (object?)ct.Coldeflist
                    .Where(n => n.NodeCase == Node.NodeOneofCase.ColumnDef)
                    .Select(n => BuildColumnDef(n.ColumnDef))
                    .ToList()
                : null)
        ));

    private static SqlNode BuildCreateEnumType(CreateEnumStmt ce, int start, int end) {
        var typeName = Ident.Qualified(ce.TypeName.Select(n => n.String.Sval));
        var vals = ce.Vals.Select(n => n.String?.Sval).OfType<string>().ToList();
        return new SqlNode("CreateTypeStatement", start, end, null, BuildProps(
            ("kind",     "ENUM"),
            ("typeName", typeName),
            ("values",   MaybeList(vals))
        ));
    }

    private static SqlNode BuildAlterEnum(AlterEnumStmt ae, int start, int end) =>
        new("AlterTypeStatement", start, end, null, BuildProps(
            ("typeName",    Ident.Qualified(ae.TypeName.Select(n => n.String.Sval))),
            ("newVal",      ae.NewVal),
            // RENAME VALUE 'old' TO 'new' (otherwise ADD VALUE 'new')
            ("oldVal",      string.IsNullOrEmpty(ae.OldVal) ? null : ae.OldVal),
            ("neighbor",    string.IsNullOrEmpty(ae.NewValNeighbor) ? null : ae.NewValNeighbor),
            ("isAfter",     ae.NewValIsAfter ? true : null),
            ("ifNotExists", ae.SkipIfNewValExists ? true : null)
        ));

    private List<string> ParseSeqOptions(Google.Protobuf.Collections.RepeatedField<Node> options) {
        var result = new List<string>();
        foreach (var o in options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            // The value as written: 64-bit bounds arrive as Float nodes, not Integer
            var value = BuildDefElemValue(defElem)?.ToString();
            result.Add(defElem.Defname switch {
                "start"     => $"START WITH {value ?? "1"}",
                "restart"   => value != null ? $"RESTART WITH {value}" : "RESTART",
                "increment" => $"INCREMENT BY {value ?? "1"}",
                "minvalue"  => value != null ? $"MINVALUE {value}" : "NO MINVALUE",
                "maxvalue"  => value != null ? $"MAXVALUE {value}" : "NO MAXVALUE",
                "cache"     => $"CACHE {value ?? "1"}",
                "cycle"     => GetBoolFromArg(defElem.Arg) ? "CYCLE" : "NO CYCLE",
                "as" when defElem.Arg?.NodeCase == Node.NodeOneofCase.TypeName
                            => $"AS {BuildPgTypeName(defElem.Arg.TypeName)}",
                "owned_by" when defElem.Arg?.NodeCase == Node.NodeOneofCase.List
                            => defElem.Arg.List.Items.Count == 1 && defElem.Arg.List.Items[0].String?.Sval == "none"
                                ? "OWNED BY NONE"
                                : $"OWNED BY {Ident.Qualified(defElem.Arg.List.Items.Select(i => i.String.Sval))}",
                _ => throw NotSupported($"sequence option ({defElem.Defname})", defElem.Location),
            });
        }
        return result;
    }

    private SqlNode BuildCreateSeq(CreateSeqStmt seq, int start, int end) {
        var options = ParseSeqOptions(seq.Options);
        return new SqlNode("CreateSequenceStatement", start, end, null, BuildProps(
            ("persistence", Persistence(seq.Sequence)),
            ("name",        Ident.QuoteOpt(seq.Sequence?.Relname)),
            ("schema",      Ident.QuoteOpt(seq.Sequence?.Schemaname)),
            ("ifNotExists", seq.IfNotExists ? true : null),
            ("options",     MaybeList(options))
        ));
    }

    private SqlNode BuildAlterSeq(AlterSeqStmt seq, int start, int end) {
        var options = ParseSeqOptions(seq.Options);
        return new SqlNode("AlterSequenceStatement", start, end, null, BuildProps(
            ("name",    Ident.QuoteOpt(seq.Sequence?.Relname)),
            ("schema",  Ident.QuoteOpt(seq.Sequence?.Schemaname)),
            ("options", MaybeList(options))
        ));
    }

    private static SqlNode BuildCreateSchema(CreateSchemaStmt cs, int start, int end) =>
        new("CreateSchemaStatement", start, end, null, BuildProps(
            ("name",        Ident.QuoteOpt(cs.Schemaname)),
            ("authRole",    Ident.QuoteOpt(cs.Authrole?.Rolename)),
            ("ifNotExists", cs.IfNotExists ? true : null)
        ));

    private static SqlNode BuildCreateExtension(CreateExtensionStmt ce, int start, int end) {
        string? schema = null, version = null;
        bool cascade = false;
        foreach (var o in ce.Options) {
            if (o.NodeCase != Node.NodeOneofCase.DefElem) continue;
            var defElem = o.DefElem;
            if (defElem.Defname == "schema" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String) schema = defElem.Arg.String.Sval;
            if (defElem.Defname == "new_version" && defElem.Arg?.NodeCase == Node.NodeOneofCase.String) version = defElem.Arg.String.Sval;
            if (defElem.Defname == "cascade" && defElem.Arg?.NodeCase == Node.NodeOneofCase.Boolean) cascade = defElem.Arg.Boolean.Boolval;
        }
        return new SqlNode("CreateExtensionStatement", start, end, null, BuildProps(
            ("name", Ident.Quote(ce.Extname)), ("ifNotExists", ce.IfNotExists ? true : null),
            ("schema", Ident.QuoteOpt(schema)), ("version", version), ("cascade", cascade ? true : null)
        ));
    }

    private SqlNode BuildCreateTableAs(CreateTableAsStmt cta, int start, int end) {
        bool isMV = cta.Objtype == ObjectType.ObjectMatview;
        var into = cta.Into;
        return new SqlNode(isMV ? "CreateMatViewStatement" : "CreateTableAsStatement", start, end, null, BuildProps(
            ("persistence",  Persistence(into?.Rel)),
            ("name",         Ident.QuoteOpt(into?.Rel?.Relname)),
            ("schema",       Ident.QuoteOpt(into?.Rel?.Schemaname)),
            ("columns",      into == null ? null : MaybeList(into.ColNames
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => Ident.Quote(n.String.Sval))
                .ToList())),
            ("accessMethod", string.IsNullOrEmpty(into?.AccessMethod) ? null : Ident.Quote(into.AccessMethod)),
            ("options",      into == null ? null : StorageOptions(into.Options)),
            ("onCommit",     into == null ? null : OnCommit(into.OnCommit)),
            ("tablespace",   Ident.QuoteOpt(into?.TableSpaceName)),
            ("withNoData",   into?.SkipData == true ? true : null),
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
            ("orReplace",    t.Replace ? true : null),
            ("isConstraint", t.Isconstraint ? true : null),
            ("name",         Ident.Quote(t.Trigname)),
            ("timing",       timing),
            ("events",       (object?)events),
            // UPDATE OF a, b: fire only when these columns are updated
            ("updateOf",     MaybeList(t.Columns
                .Where(c => c.NodeCase == Node.NodeOneofCase.String)
                .Select(c => Ident.Quote(c.String.Sval))
                .ToList())),
            ("relation",     BuildRangeVar(t.Relation)),
            ("fromRelation", t.Constrrel != null ? BuildRangeVar(t.Constrrel) : null),
            ("deferrable",   t.Deferrable ? true : null),
            ("initDeferred", t.Initdeferred ? true : null),
            // REFERENCING OLD TABLE AS o NEW TABLE AS n
            ("referencing",  MaybeList(t.TransitionRels
                .Where(r => r.NodeCase == Node.NodeOneofCase.TriggerTransition)
                .Select(r => $"{(r.TriggerTransition.IsNew ? "NEW" : "OLD")} {(r.TriggerTransition.IsTable ? "TABLE" : "ROW")} AS {Ident.Quote(r.TriggerTransition.Name)}")
                .ToList())),
            ("forEach",      t.Row ? "ROW" : "STATEMENT"),
            ("funcName",     Ident.QualifiedFunc(t.Funcname.Select(n => n.String.Sval))),
            // Trigger arguments are always string constants
            ("funcArgs",     MaybeList(t.Args
                .Where(a => a.NodeCase == Node.NodeOneofCase.String)
                .Select(a => $"'{a.String.Sval.Replace("'", "''")}'")
                .ToList())),
            ("when",         t.WhenClause != null ? BuildExpr(t.WhenClause) : null)
        ));
    }

    private SqlNode BuildComment(CommentStmt cm, int start, int end) {
        var objtype = ObjectTypeKw(cm.Objtype);
        string? objectName = cm.Object?.NodeCase switch {
            Node.NodeOneofCase.List           => Ident.Qualified(cm.Object.List.Items.Select(n => n.String?.Sval).OfType<string>()),
            Node.NodeOneofCase.ObjectWithArgs => OwaSignature(cm.Object.ObjectWithArgs),
            Node.NodeOneofCase.String         => Ident.Quote(cm.Object.String.Sval),
            Node.NodeOneofCase.TypeName       => string.Join(".", cm.Object.TypeName.Names
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval)
                .Where(v => v != "pg_catalog")
                .Select(Ident.QuoteFunc)),
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
        string? rename = null;
        var attributes = new List<string>();
        foreach (var n in s.Actions) {
            if (n.NodeCase != Node.NodeOneofCase.DefElem) continue;
            if (n.DefElem.Defname == "rename") rename = Ident.QuoteOpt(BuildDefElemValue(n.DefElem)?.ToString());
            else attributes.Add(FunctionAttribute(n.DefElem));
        }
        return new SqlNode("AlterFunctionStatement", start, end, null, BuildProps(
            ("objType",    s.Objtype == ObjectType.ObjectProcedure ? "PROCEDURE" : "FUNCTION"),
            // Name plus argument types; no list at all means "the only function named f"
            ("name",       s.Func != null ? OwaSignature(s.Func) : null),
            ("rename",     rename),
            ("attributes", MaybeList(attributes))
        ));
    }

    private SqlNode BuildAlterOwner(AlterOwnerStmt s, int start, int end) {
        var newOwner = s.Newowner?.Roletype == RoleSpecType.RolespecPublic ? "PUBLIC" : Ident.QuoteOpt(s.Newowner?.Rolename);
        return new SqlNode("AlterOwnerStatement", start, end, null, BuildProps(
            ("objType",  ObjectTypeKw(s.ObjectType)),
            ("name",     NodeObjName(s.Object)),
            ("newOwner", newOwner)
        ));
    }

    private SqlNode BuildAlterObjectSchema(AlterObjectSchemaStmt s, int start, int end) =>
        new("AlterObjectSchemaStatement", start, end, null, BuildProps(
            ("objType",   ObjectTypeKw(s.ObjectType)),
            // Tables, views, sequences and matviews carry their name in Relation, not Object
            ("name",      s.Relation != null ? RangeVarQualifiedName(s.Relation) : NodeObjName(s.Object)),
            ("ifExists",  s.MissingOk ? true : null),
            ("newSchema", Ident.QuoteOpt(s.Newschema))
        ));

    private static SqlNode BuildRefreshMatView(RefreshMatViewStmt s, int start, int end) =>
        new("RefreshMatViewStatement", start, end, null, BuildProps(
            ("name",       BuildRangeVar(s.Relation)),
            ("concurrent", s.Concurrent ? true : null),
            ("withNoData", s.SkipData ? true : null)
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
            ("ruleName", Ident.QuoteOpt(s.Rulename)),
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
            ("policyName",  Ident.QuoteOpt(s.PolicyName)),
            ("table",       BuildRangeVar(s.Table)),
            ("cmdName",     string.IsNullOrEmpty(s.CmdName) ? null : s.CmdName.ToUpper()),
            ("restrictive", !s.Permissive ? (object?)true : null),
            ("roles",       PolicyRoles(s.Roles)),
            ("using",       BuildExpr(s.Qual)),
            ("withCheck",   BuildExpr(s.WithCheck))
        ));

    private SqlNode BuildAlterPolicy(AlterPolicyStmt s, int start, int end) =>
        new("AlterPolicyStatement", start, end, null, BuildProps(
            ("policyName", Ident.QuoteOpt(s.PolicyName)),
            ("table",      BuildRangeVar(s.Table)),
            ("roles",      PolicyRoles(s.Roles)),
            ("using",      BuildExpr(s.Qual)),
            ("withCheck",  BuildExpr(s.WithCheck))
        ));

    // The TO role list of CREATE / ALTER POLICY. CREATE POLICY without TO parses as
    // `TO public`; ALTER POLICY without TO leaves the roles unchanged (empty list).
    private static object? PolicyRoles(Google.Protobuf.Collections.RepeatedField<Node> roles) =>
        MaybeList(roles
            .Where(n => n.NodeCase == Node.NodeOneofCase.RoleSpec)
            .Select(n => RoleSpecName(n.RoleSpec))
            .ToList());

    private SqlNode BuildDeclareCursor(DeclareCursorStmt s, int start, int end) {
        // CursorOptions bitmask (utils/portal.h): BINARY=0x0001, SCROLL=0x0002,
        // NO_SCROLL=0x0004, INSENSITIVE=0x0008, ASENSITIVE=0x0010, HOLD=0x0020.
        bool binary     = (s.Options & 0x0001) != 0;
        bool scroll     = (s.Options & 0x0002) != 0;
        bool noScroll   = (s.Options & 0x0004) != 0;
        bool insensitive = (s.Options & 0x0008) != 0;
        bool asensitive = (s.Options & 0x0010) != 0;
        bool withHold   = (s.Options & 0x0020) != 0;

        var query = s.Query != null ? BuildExpr(s.Query) : null;

        return new SqlNode("DeclareCursorStatement", start, end, null, BuildProps(
            ("name",        Ident.QuoteOpt(s.Portalname)),
            ("binary",      binary     ? true : null),
            ("scroll",      scroll     ? true : null),
            ("noScroll",    noScroll   ? true : null),
            ("insensitive", insensitive ? true : null),
            ("asensitive",  asensitive ? true : null),
            ("withHold",    withHold   ? true : null),
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
            ("cursor",    Ident.QuoteOpt(s.Portalname)),
            ("isMove",    s.Ismove ? true : null)
        ));
    }

    // CLOSE ALL has an empty Portalname; QuoteOpt keeps "" as "" (it only maps null to
    // null), and BuildProps only drops actual nulls, so an explicit check is needed
    // here to end up with no "cursor" prop at all — meaning ALL — instead of "".
    private static SqlNode BuildClosePortal(ClosePortalStmt s, int start, int end) =>
        new("ClosePortalStatement", start, end, null, BuildProps(
            ("cursor", string.IsNullOrEmpty(s.Portalname) ? null : Ident.Quote(s.Portalname))
        ));

    private SqlNode BuildCopy(CopyStmt s, int start, int end) {
        // Build column list from attlist (String nodes)
        var columns = s.Attlist.Count > 0
            ? (object?)s.Attlist.Select(n => n.NodeCase == Node.NodeOneofCase.String ? Ident.Quote(n.String.Sval) : "").ToList()
            : null;

        // Build options from DefElem list
        var options = s.Options.Count > 0
            ? (object?)s.Options
                .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
                .Select(n => new Dictionary<string, object?> {
                    ["name"]  = n.DefElem.Defname,
                    ["value"] = UtilityOptionValue(n.DefElem)
                })
                .ToList<object?>()
            : null;

        SqlNode? query = s.Query != null ? TryBuildDmlQuery(s.Query) : null;
        if (s.Query != null && query == null)
            throw NotSupported($"COPY query ({s.Query.NodeCase})", TryGetLocation(GetOneofValue(s.Query)));

        return new SqlNode("CopyStatement", start, end, null, BuildProps(
            ("relation",  s.Relation != null ? BuildRangeVar(s.Relation) : null),
            ("query",     query),
            ("columns",   columns),
            ("isFrom",    s.IsFrom  ? true : null),
            ("isProgram", s.IsProgram ? true : null),
            ("filename",  string.IsNullOrEmpty(s.Filename) ? null : s.Filename),
            ("options",   options),
            ("where",     s.WhereClause != null ? BuildExpr(s.WhereClause) : null)
        ));
    }

    private SqlNode BuildExplain(ExplainStmt s, int start, int end) {
        // EXPLAIN accepts everything TryBuildDmlQuery covers, plus a few kinds unique
        // to EXPLAIN: CREATE TABLE AS / CREATE MATERIALIZED VIEW, DECLARE CURSOR,
        // REFRESH MATERIALIZED VIEW, and EXECUTE.
        SqlNode? query = s.Query != null ? TryBuildDmlQuery(s.Query) : null;
        if (query == null && s.Query != null) {
            query = s.Query.NodeCase switch {
                Node.NodeOneofCase.CreateTableAsStmt => BuildCreateTableAs(s.Query.CreateTableAsStmt, 0, _sql.Length),
                Node.NodeOneofCase.DeclareCursorStmt => BuildDeclareCursor(s.Query.DeclareCursorStmt, 0, _sql.Length),
                Node.NodeOneofCase.RefreshMatViewStmt => BuildRefreshMatView(s.Query.RefreshMatViewStmt, 0, _sql.Length),
                Node.NodeOneofCase.ExecuteStmt => BuildExecute(s.Query.ExecuteStmt, 0, _sql.Length),
                _ => throw NotSupported($"EXPLAIN target ({s.Query.NodeCase})", TryGetLocation(GetOneofValue(s.Query))),
            };
        }

        var options = s.Options.Count > 0
            ? (object?)s.Options
                .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
                .Select(n => new Dictionary<string, object?> {
                    ["name"]  = n.DefElem.Defname,
                    ["value"] = UtilityOptionValue(n.DefElem)
                })
                .ToList<object?>()
            : null;

        return new SqlNode("ExplainStatement", start, end, null, BuildProps(
            ("query",   query),
            ("options", options)
        ));
    }

    private SqlNode BuildPrepare(PrepareStmt s, int start, int end) {
        var query = s.Query != null ? TryBuildDmlQuery(s.Query) : null;
        if (s.Query != null && query == null)
            throw NotSupported($"PREPARE query ({s.Query.NodeCase})", TryGetLocation(GetOneofValue(s.Query)));

        var argTypes = s.Argtypes.Count > 0
            ? (object?)s.Argtypes
                .Where(n => n.NodeCase == Node.NodeOneofCase.TypeName)
                .Select(n => BuildPgTypeName(n.TypeName))
                .ToList()
            : null;

        return new SqlNode("PrepareStatement", start, end, null, BuildProps(
            ("name",     Ident.QuoteOpt(s.Name)),
            ("argTypes", argTypes),
            ("query",    query)
        ));
    }

    private SqlNode BuildExecute(ExecuteStmt s, int start, int end) =>
        new("ExecuteStatement", start, end, null, BuildProps(
            ("name",   Ident.QuoteOpt(s.Name)),
            ("params", MapList(s.Params, BuildExpr))
        ));

    private static SqlNode BuildDeallocate(DeallocateStmt s, int start, int end) =>
        new("DeallocateStatement", start, end, null, BuildProps(
            ("name", Ident.QuoteOpt(s.Name))
        ));

    private static SqlNode BuildListen(ListenStmt s, int start, int end) =>
        new("ListenStatement", start, end, null, BuildProps(
            ("channel", Ident.QuoteOpt(s.Conditionname))
        ));

    private static SqlNode BuildUnlisten(UnlistenStmt s, int start, int end) =>
        new("UnlistenStatement", start, end, null, BuildProps(
            ("channel", Ident.QuoteOpt(s.Conditionname))
        ));

    private static SqlNode BuildNotify(NotifyStmt s, int start, int end) =>
        new("NotifyStatement", start, end, null, BuildProps(
            ("channel", Ident.QuoteOpt(s.Conditionname)),
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
        // XMLPARSE(DOCUMENT|CONTENT expr [PRESERVE|STRIP WHITESPACE]) — the DOCUMENT/CONTENT
        // keyword lives on xmloption, not in args. args[1] is the PRESERVE WHITESPACE (true) /
        // STRIP WHITESPACE (false) option; STRIP is also what an absent option parses to, so
        // the two can't be told apart — print nothing for false, matching the default.
        string? documentOrContent = xe.Op == XmlExprOp.IsXmlparse
            ? xe.Xmloption switch {
                XmlOptionType.XmloptionDocument => "DOCUMENT",
                XmlOptionType.XmloptionContent  => "CONTENT",
                _ => null,
            }
            : null;
        bool? preserveWhitespace = xe.Op == XmlExprOp.IsXmlparse && xe.Args.Count > 1
            && xe.Args[1].NodeCase == Node.NodeOneofCase.AConst
            && xe.Args[1].AConst.ValCase == A_Const.ValOneofCase.Boolval
            && xe.Args[1].AConst.Boolval.Boolval
            ? true
            : null;
        return new SqlNode("XmlExpr", 0, 0, null, BuildProps(
            ("op",                 op),
            ("name",               Ident.QuoteOpt(xe.Name)),
            ("args",               MapList(xe.Op == XmlExprOp.IsXmlparse ? xe.Args.Take(1) : xe.Args, BuildExpr)),
            ("namedArgs",          namedArgs),
            ("documentOrContent",  documentOrContent),
            ("preserveWhitespace", preserveWhitespace)
        ));
    }

    // XMLSERIALIZE(DOCUMENT|CONTENT expr AS typeName [INDENT]) — a distinct raw-parse
    // node from XmlExpr, unlike the other XML SQL functions.
    private SqlNode BuildXmlSerialize(XmlSerialize xs) {
        var documentOrContent = xs.Xmloption switch {
            XmlOptionType.XmloptionDocument => "DOCUMENT",
            XmlOptionType.XmloptionContent  => "CONTENT",
            _ => (string?)null,
        };
        return new SqlNode("XmlSerialize", 0, 0, null, BuildProps(
            ("documentOrContent", documentOrContent),
            ("expr",              xs.Expr != null ? BuildExpr(xs.Expr) : null),
            ("typeName",          xs.TypeName != null ? BuildPgTypeName(xs.TypeName) : null),
            ("indent",            xs.Indent ? true : null)
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
            returning = BuildPgTypeName(je.Output.TypeName) + JsonFormatClause(je.Output.Returning?.Format);
        return new SqlNode("JsonFuncExpr", 0, 0, null, BuildProps(
            ("op",            op),
            ("context",       context),
            ("contextFormat", JsonFormatClause(je.ContextItem?.Format) is { Length: > 0 } f ? f.Trim() : null),
            ("path",          path),
            ("passing",       MaybeList(BuildJsonPassing(je.Passing))),
            ("returning",     returning),
            ("wrapper",       JsonWrapperClause(je.Wrapper)),
            ("quotes",        JsonQuotesClause(je.Quotes)),
            ("onEmpty",       BuildJsonBehavior(je.OnEmpty)),
            ("onError",       BuildJsonBehavior(je.OnError))
        ));
    }

    // PASSING value AS name, ...: variables the JSON path can refer to as $name
    private List<SqlNode> BuildJsonPassing(IEnumerable<Node> args) => args
        .Where(n => n.NodeCase == Node.NodeOneofCase.JsonArgument)
        .Select(n => new SqlNode("JsonPassingArg", 0, 0, null, BuildProps(
            ("value", BuildExpr(n.JsonArgument.Val.RawExpr)),
            ("name",  Ident.Quote(n.JsonArgument.Name)))))
        .ToList();

    // FORMAT JSON [ENCODING UTF8], when written — the default format prints nothing
    private static string JsonFormatClause(JsonFormat? f) {
        if (f == null || f.FormatType == JsonFormatType.JsFormatDefault) return "";
        var format = f.FormatType == JsonFormatType.JsFormatJsonb ? " FORMAT JSONB" : " FORMAT JSON";
        return format + f.Encoding switch {
            JsonEncoding.JsEncUtf8  => " ENCODING UTF8",
            JsonEncoding.JsEncUtf16 => " ENCODING UTF16",
            JsonEncoding.JsEncUtf32 => " ENCODING UTF32",
            _ => "",
        };
    }

    private static string? JsonWrapperClause(JsonWrapper w) => w switch {
        JsonWrapper.JswNone          => "WITHOUT WRAPPER",
        JsonWrapper.JswConditional   => "WITH CONDITIONAL WRAPPER",
        JsonWrapper.JswUnconditional => "WITH WRAPPER",
        _ => null,
    };

    private static string? JsonQuotesClause(JsonQuotes q) => q switch {
        JsonQuotes.JsQuotesKeep => "KEEP QUOTES",
        JsonQuotes.JsQuotesOmit => "OMIT QUOTES",
        _ => null,
    };

    // -------------------------------------------------------------------------
    // SQL/JSON constructors — PostgreSQL 16+
    // -------------------------------------------------------------------------

    // JSON_OBJECT('key': value, ...) constructor
    private SqlNode BuildJsonObjectConstructor(JsonObjectConstructor c) {
        var pairs = c.Exprs
            .Select(n => {
                var kv = n.JsonKeyValue;
                return (object?)new SqlNode("JsonKeyValuePair", 0, 0, null, BuildProps(
                    ("key",   BuildExpr(kv.Key)),
                    ("value", BuildJsonValue(kv.Value))
                ));
            })
            .ToList();
        var props = BuildProps(
            ("pairs",  pairs),
            ("unique", c.Unique ? true : null)
        );
        foreach (var (k, v) in JsonConstructorProps(c.Output, c.AbsentOnNull, absentByDefault: false)) if (v != null) props[k] = v;
        return new SqlNode("JsonObjectConstructor", 0, 0, null, props);
    }

    // JSON_ARRAY(val, ...) constructor
    private SqlNode BuildJsonArrayConstructor(JsonArrayConstructor c) {
        var items = c.Exprs
            .Select(n => BuildJsonValue(n.JsonValueExpr))
            .ToList();
        var props = BuildProps(("items", items));
        foreach (var (k, v) in JsonConstructorProps(c.Output, c.AbsentOnNull, absentByDefault: true)) if (v != null) props[k] = v;
        return new SqlNode("JsonArrayConstructor", 0, 0, null, props);
    }

    // A JSON constructor argument: the expression, plus FORMAT JSON when written
    private SqlNode? BuildJsonValue(JsonValueExpr v) {
        var expr = BuildExpr(v.RawExpr);
        var format = JsonFormatClause(v.Format);
        return format.Length == 0 || expr == null ? expr
            : new SqlNode("JsonFormatted", 0, 0, null, BuildProps(("expr", expr), ("format", format.Trim())));
    }

    // JSON_OBJECTAGG(key: value) aggregate
    private SqlNode BuildJsonObjectAgg(JsonObjectAgg a) {
        var kv = a.Arg;
        var props = BuildProps(
            ("key",    BuildExpr(kv.Key)),
            ("value",  BuildJsonValue(kv.Value)),
            ("unique", a.Unique ? true : null)
        );
        AddJsonAggProps(props, a.Constructor, a.AbsentOnNull, absentByDefault: false);
        return new SqlNode("JsonObjectAgg", 0, 0, null, props);
    }

    // JSON_ARRAYAGG(expr [ORDER BY ...]) aggregate
    private SqlNode BuildJsonArrayAgg(JsonArrayAgg a) {
        var props = BuildProps(
            ("arg",      BuildJsonValue(a.Arg)),
            ("aggOrder", MapList(a.Constructor?.AggOrder, BuildExpr))
        );
        AddJsonAggProps(props, a.Constructor, a.AbsentOnNull, absentByDefault: true);
        return new SqlNode("JsonArrayAgg", 0, 0, null, props);
    }

    // RETURNING / ON NULL, and the aggregate's FILTER (WHERE ...) and OVER (...)
    private void AddJsonAggProps(Dictionary<string, object?> props, JsonAggConstructor? c, bool absentOnNull, bool absentByDefault) {
        foreach (var (k, v) in JsonConstructorProps(c?.Output, absentOnNull, absentByDefault)) if (v != null) props[k] = v;
        if (c?.AggFilter != null) props["filter"] = BuildExpr(c.AggFilter);
        if (BuildOver(c?.Over) is { } over) props["over"] = over;
    }

    // The value of a COPY / EXPLAIN option as SQL text, or null for a bare flag such as
    // `analyze` or `header` (which means true). Words stay bare when that reads back
    // identically; other strings are quoted: `delimiter ','`, `encoding 'UTF8'`.
    private string? UtilityOptionValue(DefElem d) {
        if (d.Arg == null) return null;
        var a = d.Arg;
        string Word(string v) => v is "true" or "false" or "on" or "off" || Ident.Quote(v) == v ? v : $"'{v.Replace("'", "''")}'";
        return a.NodeCase switch {
            Node.NodeOneofCase.String  => Word(a.String.Sval),
            Node.NodeOneofCase.Integer => a.Integer.Ival.ToString(),
            Node.NodeOneofCase.Float   => a.Float.Fval,
            Node.NodeOneofCase.Boolean => a.Boolean.Boolval ? "true" : "false",
            Node.NodeOneofCase.AStar   => "*",
            // force_quote (a, b)
            Node.NodeOneofCase.List    => $"({string.Join(", ", a.List.Items.Select(i => Ident.Quote(i.String.Sval)))})",
            Node.NodeOneofCase.AConst  => a.AConst.ValCase switch {
                A_Const.ValOneofCase.Sval    => Word(a.AConst.Sval.Sval),
                A_Const.ValOneofCase.Ival    => a.AConst.Ival.Ival.ToString(),
                A_Const.ValOneofCase.Fval    => a.AConst.Fval.Fval,
                A_Const.ValOneofCase.Boolval => a.AConst.Boolval.Boolval ? "true" : "false",
                _ => throw NotSupported($"option value ({d.Defname})", d.Location),
            },
            _ => throw NotSupported($"option value ({d.Defname}: {a.NodeCase})", d.Location),
        };
    }

    // Helper to extract a string or bool value from a DefElem Arg. quoteStrings requotes
    // a genuine Sconst (String/AConst.Sval — as opposed to the bare-identifier TypeName
    // form) as a SQL string literal: reloption WITH (...) clauses need this to round-trip
    // (an unquoted `publish = insert` reparses as a different node kind than the original
    // `publish = 'insert'`), but most other DefElem values — e.g. ALTER FUNCTION RENAME TO
    // — want the bare text. A value that's exactly a RESERVED_KEYWORD spelling (true,
    // false, on, ...) stays bare either way: def_arg's grammar routes only reserved
    // keywords through this same String-node path when written bare, and PostgreSQL's
    // case-insensitive scanner always folds a bare occurrence back to that exact
    // lowercase text, so printing it bare reparses identically — no need to requote it,
    // and the user's original bare `true`/`off`/`on` spelling reads better than `'true'`.
    private static object? BuildDefElemValue(DefElem defElem, bool quoteStrings = false) {
        if (defElem.Arg == null) return null;
        string Quote(string v) => quoteStrings && !Ident.IsReservedKeyword(v) ? $"'{v.Replace("'", "''")}'" : v;
        return defElem.Arg.NodeCase switch {
            Node.NodeOneofCase.String  => Quote(defElem.Arg.String.Sval),
            Node.NodeOneofCase.Integer => defElem.Arg.Integer.Ival.ToString(),
            Node.NodeOneofCase.Float   => defElem.Arg.Float.Fval,
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Sval    => Quote(defElem.Arg.AConst.Sval.Sval),
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Ival    => defElem.Arg.AConst.Ival.Ival.ToString(),
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Fval    => defElem.Arg.AConst.Fval.Fval,
            Node.NodeOneofCase.AConst when defElem.Arg.AConst.ValCase == A_Const.ValOneofCase.Boolval => defElem.Arg.AConst.Boolval.Boolval ? "true" : "false",
            // A bare identifier value (e.g. WITH (fastupdate = off)) parses through
            // def_arg's func_type alternative as a one-part TypeName, not a String —
            // only ON is a reserved keyword and takes the String path. libpg_query hands
            // back the identifier's real value (a quoted one verbatim, case preserved),
            // so it must be re-quoted the same as any other identifier — printing it bare
            // would fold e.g. "Off" to plain off on the next parse, changing its value.
            Node.NodeOneofCase.TypeName when defElem.Arg.TypeName.Names.Count == 1
                && defElem.Arg.TypeName.Names[0].NodeCase == Node.NodeOneofCase.String
                => Ident.Quote(defElem.Arg.TypeName.Names[0].String.Sval),
            _ => null,
        };
    }

    // -------------------------------------------------------------------------
    // P4: VACUUM / ANALYZE / CLUSTER / REINDEX
    // -------------------------------------------------------------------------

    private SqlNode BuildVacuum(VacuumStmt s, int start, int end) {
        var isVacuum = s.IsVacuumcmd;
        // PARALLEL 4, INDEX_CLEANUP off, …: the value is part of the option
        var options = s.Options
            .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem)
            .Select(n => UtilityOptionValue(n.DefElem) is { } value
                ? $"{n.DefElem.Defname.ToUpper()} {value}"
                : n.DefElem.Defname.ToUpper())
            .ToList();
        var rels = s.Rels
            .Where(n => n.NodeCase == Node.NodeOneofCase.VacuumRelation)
            .Select(n => {
                // VACUUM ANALYZE t (a, b) / ANALYZE t (a, b): only these columns
                var rel = BuildRangeVar(n.VacuumRelation.Relation);
                var cols = n.VacuumRelation.VaCols
                    .Where(c => c.NodeCase == Node.NodeOneofCase.String)
                    .Select(c => Ident.Quote(c.String.Sval))
                    .ToList();
                if (cols.Count > 0) rel.Props!["columns"] = cols;
                return rel;
            })
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
            ("indexName", Ident.QuoteOpt(s.Indexname))
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
            ("name",    Ident.QuoteOpt(s.Servername)),
            ("fdwName", Ident.QuoteOpt(s.Fdwname)),
            ("options", OptionsToObject(options))
        ));
    }

    private SqlNode BuildCreateForeignTable(CreateForeignTableStmt s, int start, int end) {
        var columns = s.BaseStmt != null ? MapList(s.BaseStmt.TableElts, BuildTableElement) : null;
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("CreateForeignTableStatement", start, end, null, BuildProps(
            ("name",       s.BaseStmt?.Relation != null ? BuildRangeVar(s.BaseStmt.Relation) : null),
            ("columns",    columns),
            ("serverName", Ident.QuoteOpt(s.Servername)),
            ("options",    OptionsToObject(options))
        ));
    }

    private static SqlNode BuildCreateUserMapping(CreateUserMappingStmt s, int start, int end) {
        var roleText = s.User?.Roletype switch {
            RoleSpecType.RolespecCurrentUser  => "current_user",
            RoleSpecType.RolespecCurrentRole  => "current_role",
            RoleSpecType.RolespecSessionUser  => "session_user",
            RoleSpecType.RolespecPublic       => "public",
            _                                 => Ident.QuoteOpt(s.User?.Rolename) ?? "current_user",
        };
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("CreateUserMappingStatement", start, end, null, BuildProps(
            ("user",       roleText),
            ("serverName", Ident.QuoteOpt(s.Servername)),
            ("options",    OptionsToObject(options))
        ));
    }

    private static SqlNode BuildImportForeignSchema(ImportForeignSchemaStmt s, int start, int end) {
        var tables = MaybeList(s.TableList
            .Where(n => n.NodeCase == Node.NodeOneofCase.RangeVar)
            .Select(n => RangeVarQualifiedName(n.RangeVar))
            .ToList());
        var options = BuildDefElemOptions(s.Options);
        return new SqlNode("ImportForeignSchemaStatement", start, end, null, BuildProps(
            ("remoteSchema", Ident.QuoteOpt(s.RemoteSchema)),
            ("serverName",   Ident.QuoteOpt(s.ServerName)),
            ("localSchema",  Ident.QuoteOpt(s.LocalSchema)),
            ("listType",     s.ListType switch {
                ImportForeignSchemaType.FdwImportSchemaLimitTo => "LIMIT TO",
                ImportForeignSchemaType.FdwImportSchemaExcept  => "EXCEPT",
                _                                               => null,
            }),
            ("tables",       tables),
            ("options",      OptionsToObject(options))
        ));
    }

    // -------------------------------------------------------------------------
    // P4: Logical Replication
    // -------------------------------------------------------------------------

    private SqlNode BuildCreatePublication(CreatePublicationStmt s, int start, int end) {
        var pubObjects = s.Pubobjects
            .Where(n => n.NodeCase == Node.NodeOneofCase.PublicationObjSpec)
            .Select(n => BuildPublicationObjSpec(n.PublicationObjSpec))
            .ToList();
        return new SqlNode("CreatePublicationStatement", start, end, null, BuildProps(
            ("name",         Ident.QuoteOpt(s.Pubname)),
            ("forAllTables", s.ForAllTables ? true : null),
            ("pubObjects",   MaybeList(pubObjects)),
            // WITH (publish = 'insert', ...) — reloption syntax, not OPTIONS (...)
            ("options",      StorageOptions(s.Options))
        ));
    }

    // FOR TABLE t (cols) WHERE (expr), TABLES IN SCHEMA s, TABLES IN CURRENT SCHEMA
    private SqlNode BuildPublicationObjSpec(PublicationObjSpec spec) {
        var kind = spec.Pubobjtype switch {
            PublicationObjSpecType.PublicationobjTable               => "TABLE",
            PublicationObjSpecType.PublicationobjTablesInSchema       => "TABLES IN SCHEMA",
            PublicationObjSpecType.PublicationobjTablesInCurSchema    => "TABLES IN CURRENT SCHEMA",
            _                                                          => spec.Pubobjtype.ToString(),
        };
        var table = spec.Pubtable;
        var columns = table != null
            ? MaybeList(table.Columns
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => Ident.Quote(n.String.Sval))
                .ToList())
            : null;
        return new SqlNode("PublicationObject", 0, 0, null, BuildProps(
            ("kind",     kind),
            ("relation", table?.Relation != null ? BuildRangeVar(table.Relation) : null),
            ("columns",  columns),
            ("where",    table?.WhereClause != null ? BuildExpr(table.WhereClause) : null),
            ("schema",   kind == "TABLES IN SCHEMA" ? Ident.QuoteOpt(spec.Name) : null)
        ));
    }

    private SqlNode BuildAlterPublication(AlterPublicationStmt s, int start, int end) {
        var pubObjects = s.Pubobjects
            .Where(n => n.NodeCase == Node.NodeOneofCase.PublicationObjSpec)
            .Select(n => BuildPublicationObjSpec(n.PublicationObjSpec))
            .ToList();
        // Undefined action + no pubObjects: the reloption-only `SET (...)` form.
        var action = s.Action switch {
            AlterPublicationAction.ApAddObjects  => "ADD",
            AlterPublicationAction.ApDropObjects => "DROP",
            AlterPublicationAction.ApSetObjects  => "SET",
            _                                    => null,
        };
        return new SqlNode("AlterPublicationStatement", start, end, null, BuildProps(
            ("name",       Ident.QuoteOpt(s.Pubname)),
            ("action",     action),
            ("pubObjects", MaybeList(pubObjects)),
            // WITH (publish = 'insert', ...) — reloption syntax, not OPTIONS (...)
            ("options",    StorageOptions(s.Options))
        ));
    }

    private static SqlNode BuildCreateSubscription(CreateSubscriptionStmt s, int start, int end) {
        var publications = s.Publication
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => Ident.Quote(n.String.Sval))
            .ToList();
        return new SqlNode("CreateSubscriptionStatement", start, end, null, BuildProps(
            ("name",         Ident.QuoteOpt(s.Subname)),
            ("conninfo",     s.Conninfo),
            ("publications", MaybeList(publications)),
            ("options",      StorageOptions(s.Options))
        ));
    }

    private SqlNode BuildAlterSubscription(AlterSubscriptionStmt s, int start, int end) {
        var publications = s.Publication
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => Ident.Quote(n.String.Sval))
            .ToList();
        var kind = s.Kind switch {
            AlterSubscriptionType.AlterSubscriptionOptions       => "OPTIONS",
            AlterSubscriptionType.AlterSubscriptionConnection    => "CONNECTION",
            AlterSubscriptionType.AlterSubscriptionSetPublication => "SET PUBLICATION",
            AlterSubscriptionType.AlterSubscriptionAddPublication => "ADD PUBLICATION",
            AlterSubscriptionType.AlterSubscriptionDropPublication => "DROP PUBLICATION",
            AlterSubscriptionType.AlterSubscriptionRefresh       => "REFRESH PUBLICATION",
            AlterSubscriptionType.AlterSubscriptionEnabled       => "ENABLED",
            AlterSubscriptionType.AlterSubscriptionSkip          => "SKIP",
            _                                                    => throw NotSupported($"ALTER SUBSCRIPTION ({s.Kind})", 0),
        };
        // ENABLE and DISABLE both parse to AlterSubscriptionEnabled — the difference is
        // an "enabled" boolean DefElem in Options, not part of Kind.
        bool? enabled = s.Kind == AlterSubscriptionType.AlterSubscriptionEnabled
            ? s.Options
                .Where(n => n.NodeCase == Node.NodeOneofCase.DefElem && n.DefElem.Defname == "enabled")
                .Select(n => n.DefElem.Arg?.NodeCase == Node.NodeOneofCase.Boolean ? (bool?)n.DefElem.Arg.Boolean.Boolval : null)
                .FirstOrDefault()
            : null;
        return new SqlNode("AlterSubscriptionStatement", start, end, null, BuildProps(
            ("name",         Ident.QuoteOpt(s.Subname)),
            ("kind",         kind),
            ("conninfo",     s.Kind == AlterSubscriptionType.AlterSubscriptionConnection ? s.Conninfo : null),
            ("publications", MaybeList(publications)),
            ("enabled",      enabled),
            ("options",      StorageOptions(s.Options))
        ));
    }

    private static SqlNode BuildDropSubscription(DropSubscriptionStmt s, int start, int end) =>
        new("DropSubscriptionStatement", start, end, null, BuildProps(
            ("name",     Ident.QuoteOpt(s.Subname)),
            ("ifExists", s.MissingOk ? true : null),
            ("cascade",  s.Behavior == DropBehavior.DropCascade ? true : null)
        ));

    // -------------------------------------------------------------------------
    // P4: DefineStmt (CREATE AGGREGATE / OPERATOR / COLLATION)
    // -------------------------------------------------------------------------

    private SqlNode BuildDefine(DefineStmt s, int start, int end) {
        var nameParts = s.Defnames.Select(n => n.NodeCase == Node.NodeOneofCase.String
            ? n.String.Sval
            : n.NodeCase.ToString());
        var name = s.Kind == ObjectType.ObjectOperator
            ? Ident.QualifiedObj(nameParts)
            : Ident.QualifiedFunc(nameParts);

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
                        ("fromName", Ident.QuoteOpt(fromVal))
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

    private string BuildDefElemStringValue(DefElem defElem) {
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
            objName = Ident.Qualified(s.Object.List.Items
                .Where(n => n.NodeCase == Node.NodeOneofCase.String)
                .Select(n => n.String.Sval));
        } else if (s.Object?.NodeCase == Node.NodeOneofCase.RangeVar) {
            objName = RangeVarQualifiedName(s.Object.RangeVar);
        }

        return new SqlNode("SecurityLabelStatement", start, end, null, BuildProps(
            ("provider", s.Provider),
            ("objType",  objType),
            ("objName",  objName),
            ("label",    s.Label)
        ));
    }

    // -------------------------------------------------------------------------
    // XMLTABLE / JSON_TABLE (FROM-clause table functions)
    // -------------------------------------------------------------------------

    private SqlNode BuildRangeTableFunc(RangeTableFunc r) {
        var columns = r.Columns
            .Where(n => n.NodeCase == Node.NodeOneofCase.RangeTableFuncCol)
            .Select(n => {
                var col = n.RangeTableFuncCol;
                if (col.ForOrdinality) {
                    return new SqlNode("XmlTableOrdinalityCol", 0, 0, null, BuildProps(
                        ("name", Ident.QuoteOpt(col.Colname))
                    ));
                }
                return new SqlNode("XmlTableCol", 0, 0, null, BuildProps(
                    ("name",     Ident.QuoteOpt(col.Colname)),
                    ("typeName", col.TypeName != null ? BuildPgTypeName(col.TypeName) : null),
                    ("path",     col.Colexpr    != null ? BuildExpr(col.Colexpr)    : null),
                    ("default",  col.Coldefexpr != null ? BuildExpr(col.Coldefexpr) : null),
                    ("notNull",  col.IsNotNull  ? true : null)
                ));
            })
            .ToList();

        return new SqlNode("XmlTable", 0, 0, null, BuildProps(
            ("rowExpr", BuildExpr(r.Rowexpr)),
            ("docExpr", BuildExpr(r.Docexpr)),
            ("columns", MaybeList(columns)),
            ("alias",   Ident.QuoteOpt(r.Alias?.Aliasname)),
            ("lateral", r.Lateral ? true : null)
        ));
    }

    private SqlNode BuildJsonTable(JsonTable jt) {
        var context  = jt.ContextItem != null ? BuildExpr(jt.ContextItem.RawExpr) : null;
        var path     = jt.Pathspec?.String != null ? BuildExpr(jt.Pathspec.String) : null;
        var pathName = Ident.QuoteOpt(jt.Pathspec?.Name);
        var columns  = BuildJsonTableColumns(jt.Columns);
        var onError  = BuildJsonBehavior(jt.OnError);

        return new SqlNode("JsonTable", 0, 0, null, BuildProps(
            ("context",  context),
            ("path",     path),
            ("pathName", pathName),
            ("columns",  MaybeList(columns)),
            ("passing",  MaybeList(BuildJsonPassing(jt.Passing))),
            ("onError",  onError),
            ("alias",    Ident.QuoteOpt(jt.Alias?.Aliasname)),
            ("lateral",  jt.Lateral ? true : null)
        ));
    }

    private List<SqlNode> BuildJsonTableColumns(IEnumerable<Node> cols) =>
        cols
            .Where(n => n.NodeCase == Node.NodeOneofCase.JsonTableColumn)
            .Select(n => {
                var col = n.JsonTableColumn;
                var coltype = col.Coltype switch {
                    JsonTableColumnType.JtcForOrdinality => "FOR_ORDINALITY",
                    JsonTableColumnType.JtcExists        => "EXISTS",
                    JsonTableColumnType.JtcFormatted     => "FORMATTED",
                    JsonTableColumnType.JtcNested        => "NESTED",
                    _                                    => "REGULAR",
                };
                var path     = col.Pathspec?.String != null ? BuildExpr(col.Pathspec.String) : null;
                var pathName = Ident.QuoteOpt(col.Pathspec?.Name);
                var nested   = col.Columns.Count > 0
                    ? (object?)BuildJsonTableColumns(col.Columns)
                    : null;
                return new SqlNode("JsonTableColumn", 0, 0, null, BuildProps(
                    ("coltype",  coltype),
                    ("name",     Ident.QuoteOpt(col.Name)),
                    ("typeName", col.TypeName != null ? BuildPgTypeName(col.TypeName) : null),
                    ("path",     path),
                    ("pathName", pathName),
                    ("format",   JsonFormatClause(col.Format) is { Length: > 0 } f ? f.Trim() : null),
                    ("wrapper",  JsonWrapperClause(col.Wrapper)),
                    ("quotes",   JsonQuotesClause(col.Quotes)),
                    ("onEmpty",  BuildJsonBehavior(col.OnEmpty)),
                    ("onError",  BuildJsonBehavior(col.OnError)),
                    ("columns",  nested)
                ));
            })
            .ToList();

    // NULL / ERROR / DEFAULT expr / ... — the printer adds ON EMPTY or ON ERROR
    private SqlNode? BuildJsonBehavior(JsonBehavior? b) {
        if (b == null) return null;
        var kind = b.Btype switch {
            JsonBehaviorType.JsonBehaviorNull        => "NULL",
            JsonBehaviorType.JsonBehaviorError       => "ERROR",
            JsonBehaviorType.JsonBehaviorEmpty       => "EMPTY",
            JsonBehaviorType.JsonBehaviorEmptyArray  => "EMPTY ARRAY",
            JsonBehaviorType.JsonBehaviorEmptyObject => "EMPTY OBJECT",
            JsonBehaviorType.JsonBehaviorDefault     => "DEFAULT",
            JsonBehaviorType.JsonBehaviorTrue        => "TRUE",
            JsonBehaviorType.JsonBehaviorFalse       => "FALSE",
            JsonBehaviorType.JsonBehaviorUnknown     => "UNKNOWN",
            _ => throw NotSupported($"JSON behavior ({b.Btype})", b.Location),
        };
        return new SqlNode("JsonBehavior", 0, 0, null, BuildProps(
            ("kind", kind),
            ("expr", b.Btype == JsonBehaviorType.JsonBehaviorDefault ? BuildExpr(b.Expr) : null)));
    }

    // -------------------------------------------------------------------------
    // DBA / utility statements
    // -------------------------------------------------------------------------

    private static SqlNode BuildDiscard(DiscardStmt d, int start, int end) {
        var target = d.Target switch {
            DiscardMode.DiscardAll       => "ALL",
            DiscardMode.DiscardPlans     => "PLANS",
            DiscardMode.DiscardSequences => "SEQUENCES",
            DiscardMode.DiscardTemp      => "TEMP",
            _                            => "ALL",
        };
        return new SqlNode("DiscardStatement", start, end, null, BuildProps(("target", target)));
    }

    private static SqlNode BuildLoad(LoadStmt s, int start, int end) =>
        new("LoadStatement", start, end, null, BuildProps(("filename", s.Filename)));

    private SqlNode BuildAlterSystem(AlterSystemStmt s, int start, int end) {
        var inner = s.Setstmt;
        if (inner.Kind == VariableSetKind.VarSetValue) {
            var vals = inner.Args.Select(SetValue).ToList();
            return new SqlNode("AlterSystemStatement", start, end, null, BuildProps(
                ("kind", "SET"), ("name", inner.Name),
                ("values", MaybeList(vals))));
        }
        if (inner.Kind == VariableSetKind.VarReset)
            return new SqlNode("AlterSystemStatement", start, end, null, BuildProps(
                ("kind", "RESET"), ("name", inner.Name)));
        if (inner.Kind == VariableSetKind.VarResetAll)
            return new SqlNode("AlterSystemStatement", start, end, null, BuildProps(("kind", "RESET ALL")));
        return Fallback(start, end);
    }

    private static string RoleSpecName(RoleSpec? r) => r?.Roletype switch {
        RoleSpecType.RolespecCurrentUser => "current_user",
        RoleSpecType.RolespecCurrentRole => "current_role",
        RoleSpecType.RolespecSessionUser => "session_user",
        RoleSpecType.RolespecPublic      => "public",
        _                                => Ident.QuoteOpt(r?.Rolename) ?? "",
    };

    private static SqlNode BuildReassignOwned(ReassignOwnedStmt s, int start, int end) {
        var roles = s.Roles
            .Where(n => n.NodeCase == Node.NodeOneofCase.RoleSpec)
            .Select(n => RoleSpecName(n.RoleSpec))
            .ToList();
        return new SqlNode("ReassignOwnedStatement", start, end, null, BuildProps(
            ("roles",   MaybeList(roles)),
            ("newRole", RoleSpecName(s.Newrole))
        ));
    }

    private static SqlNode BuildDropOwned(DropOwnedStmt s, int start, int end) {
        var roles = s.Roles
            .Where(n => n.NodeCase == Node.NodeOneofCase.RoleSpec)
            .Select(n => RoleSpecName(n.RoleSpec))
            .ToList();
        // Only emit CASCADE; RESTRICT is the default and is omitted (same as DROP TABLE)
        var behavior = s.Behavior == DropBehavior.DropCascade ? "CASCADE" : null;
        return new SqlNode("DropOwnedStatement", start, end, null, BuildProps(
            ("roles",    MaybeList(roles)),
            ("behavior", behavior)
        ));
    }

    private static SqlNode BuildCreateTableSpace(CreateTableSpaceStmt s, int start, int end) =>
        new("CreateTableSpaceStatement", start, end, null, BuildProps(
            ("name",     Ident.QuoteOpt(s.Tablespacename)),
            ("location", s.Location),
            ("owner",    Ident.QuoteOpt(s.Owner?.Rolename))
        ));

    private static SqlNode BuildDropTableSpace(DropTableSpaceStmt s, int start, int end) =>
        new("DropTableSpaceStatement", start, end, null, BuildProps(
            ("name",     Ident.QuoteOpt(s.Tablespacename)),
            ("ifExists", s.MissingOk ? true : null)
        ));

    private SqlNode Fallback(int start, int end) {
        // Preserve the original SQL text verbatim so the user's code is never silently dropped.
        var text = (start >= 0 && end > start && end <= _sql.Length)
            ? _sql[start..end].TrimEnd(';').Trim()
            : null;
        return new("UnknownStatement", start, end, text, null);
    }

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
        ObjectType.ObjectAccessMethod    => "ACCESS METHOD",
        ObjectType.ObjectAggregate       => "AGGREGATE",
        ObjectType.ObjectCast            => "CAST",
        ObjectType.ObjectCollation       => "COLLATION",
        ObjectType.ObjectConversion      => "CONVERSION",
        ObjectType.ObjectEventTrigger    => "EVENT TRIGGER",
        ObjectType.ObjectFdw             => "FOREIGN DATA WRAPPER",
        ObjectType.ObjectForeignServer   => "SERVER",
        ObjectType.ObjectLanguage        => "LANGUAGE",
        ObjectType.ObjectLargeobject     => "LARGE OBJECT",
        ObjectType.ObjectOpclass         => "OPERATOR CLASS",
        ObjectType.ObjectOpfamily        => "OPERATOR FAMILY",
        ObjectType.ObjectOperator        => "OPERATOR",
        ObjectType.ObjectPublication     => "PUBLICATION",
        ObjectType.ObjectRoutine         => "ROUTINE",
        ObjectType.ObjectStatisticExt    => "STATISTICS",
        ObjectType.ObjectSubscription    => "SUBSCRIPTION",
        ObjectType.ObjectTablespace      => "TABLESPACE",
        ObjectType.ObjectTransform       => "TRANSFORM",
        ObjectType.ObjectTsconfiguration => "TEXT SEARCH CONFIGURATION",
        ObjectType.ObjectTsdictionary    => "TEXT SEARCH DICTIONARY",
        ObjectType.ObjectTsparser        => "TEXT SEARCH PARSER",
        ObjectType.ObjectTstemplate      => "TEXT SEARCH TEMPLATE",
        ObjectType.ObjectUserMapping     => "USER MAPPING",
        ObjectType.ObjectTable     => "TABLE",
        ObjectType.ObjectIndex     => "INDEX",
        ObjectType.ObjectView      => "VIEW",
        ObjectType.ObjectMatview   => "MATERIALIZED VIEW",
        ObjectType.ObjectForeignTable => "FOREIGN TABLE",
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

    /// <summary>
    /// Extracts a dotted name from an ObjectWithArgs.Objname list — a function,
    /// aggregate or procedure name, or an operator symbol, which is never quoted.
    /// </summary>
    private static string OwaName(Google.Protobuf.Collections.RepeatedField<Node> objname) =>
        Ident.QualifiedObj(objname.Select(n => n.String.Sval));

    /// <summary>
    /// A function, aggregate or operator name with its argument types — `f(integer, text)`,
    /// `f()`, `=== (integer, integer)`, `@@ (text, none)` — which is what identifies one
    /// overload, and which an operator always requires. Just `f` when the SQL gave no
    /// argument list ("the only function named f").
    /// </summary>
    private string OwaSignature(ObjectWithArgs owa) {
        var name = OwaName(owa.Objname);
        if (owa.ArgsUnspecified) return name;
        var args = owa.Objargs.Select(n => n.NodeCase == Node.NodeOneofCase.TypeName ? BuildPgTypeName(n.TypeName) : "none");
        var isOperator = Ident.IsOperatorSymbol(owa.Objname.LastOrDefault()?.String?.Sval ?? "");
        return $"{name}{(isOperator ? " " : "")}({string.Join(", ", args)})";
    }

    /// <summary>Formats a RangeVar as a quoted, possibly schema-qualified name.</summary>
    private static string RangeVarQualifiedName(RangeVar rv) =>
        Ident.Qualified(new[] { rv.Schemaname, rv.Relname }.Where(p => !string.IsNullOrEmpty(p)));

    /// <summary>Extracts a dotted name from a Node (RangeVar, ObjectWithArgs, List of strings, or String).</summary>
    private string? NodeObjName(Node? node) => node?.NodeCase switch {
        Node.NodeOneofCase.RangeVar       => RangeVarQualifiedName(node.RangeVar),
        Node.NodeOneofCase.ObjectWithArgs => OwaSignature(node.ObjectWithArgs),
        Node.NodeOneofCase.List           => Ident.Qualified(node.List.Items
            .Where(n => n.NodeCase == Node.NodeOneofCase.String)
            .Select(n => n.String.Sval)),
        Node.NodeOneofCase.String         => Ident.Quote(node.String.Sval),
        _                                 => null,
    };

    private static bool GetBoolFromArg(Node? arg) => arg?.NodeCase switch {
        Node.NodeOneofCase.Integer => arg.Integer.Ival != 0,
        Node.NodeOneofCase.Boolean => arg.Boolean.Boolval,
        Node.NodeOneofCase.AConst when arg.AConst.ValCase == A_Const.ValOneofCase.Ival => arg.AConst.Ival.Ival != 0,
        _ => true,
    };
}
