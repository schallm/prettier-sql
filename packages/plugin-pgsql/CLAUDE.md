# prettier-plugin-pgsql — Developer Guide for Claude

## What this project is

A Prettier plugin for PostgreSQL SQL, structured identically to
[prettier-plugin-tsql](../prettier-plugin-tsql). Read that project's code freely
for patterns to follow — the architecture is intentionally the same.

## Architecture

```
SQL string
  → C# (PgScriptDom.dll via node-api-dotnet)
      SqlParser.Parse(sql)
        → pgsqlparser (libpg_query .NET wrapper) produces a protobuf parse tree
        → AstBuilder walks the tree, emits SqlNode JSON
  → TypeScript (Prettier plugin)
      parser/index.ts receives SqlNode JSON
      printer/ dispatches on node.type → Prettier Doc
  → Formatted SQL string
```

### Key difference from tsql

T-SQL uses ScriptDOM's `TSqlFragmentVisitor` base class — override `ExplicitVisit(SomeNode)` and
ScriptDOM calls you. PostgreSQL has no visitor; `AstBuilder.cs` manually switches on
`Node.NodeCase` (a protobuf oneof discriminant) and recurses explicitly.

## C# project — `src/dotnet/PgScriptDom/`

### `SqlParser.cs`
Calls `PgSqlParser.Parser.Parse(sql)` which returns `Result<ParseResult?>`.
Serializes `AstBuilder.Build(result.Value)` as JSON with camelCase keys, null values omitted.
No comment extraction yet (libpg_query does not expose a comment token stream the same way
ScriptDOM does — this is a future task).

### `AstBuilder.cs`
Walks the `ParseResult.Stmts` list. Each `RawStmt` has a `Stmt` (`Node`) with a `NodeCase` oneof.
Key patterns:

```csharp
// Statement dispatch
Node.NodeOneofCase.SelectStmt => BuildSelect(stmt.SelectStmt, start, end),

// Expression dispatch
Node.NodeOneofCase.AConst    => BuildAConst(node.AConst),
Node.NodeOneofCase.ColumnRef => BuildColumnRef(node.ColumnRef),
...

// Helpers
private static List<SqlNode>? MapList<T>(IEnumerable<T>? items, Func<T, SqlNode?> map)
private static Dictionary<string, object?> BuildProps(params (string key, object? value)[] entries)
```

`BuildProps` drops null values so the JSON stays clean.

### `pgsqlparser` NuGet package — naming gotchas

The package namespace is **`PgSqlParser`** (not `PgQuery`).
Protobuf field naming (proto snake_case → C# PascalCase):

| Proto field | C# property |
|---|---|
| `target_list` | `TargetList` |
| `where_clause` | `WhereClause` |
| `from_clause` | `FromClause` |
| `sort_clause` | `SortClause` |

**`A_Const`** — `isnull` is a plain `bool` field on the message, NOT a oneof case.
Check `c.Isnull` separately before switching on `c.ValCase`.
Oneof cases: `Ival`, `Fval`, `Boolval`, `Sval`, `Bsval`.

**`SortByDir`** enum values (from proto `SORTBY_ASC` etc.):
`SortbyAsc`, `SortbyDesc`, `SortbyUsing`, `SortbyDefault` — note lowercase 'b'.

**`Integer`/`Float`/`String`/`Boolean`** message field names:
`Ival`, `Fval`, `Sval`, `Boolval` — no trailing underscore.

### Native library

`pgsqlparser` ships `libpg_query` as a platform native library under
`runtimes/<rid>/native/`. The build script runs `scripts/copy-native.mjs` after
`dotnet msbuild ... /t:Publish` to copy the correct platform library flat into
`bin/dotnet/` so .NET's `DllImport` probing finds it.

If you add a new platform RID, update `scripts/copy-native.mjs`.

## TypeScript project — `src/plugin/`

### Shared with tsql (identical or near-identical)
- `parser/types.ts` — `SqlNode` and `CommentToken` interfaces
- `printer/utils.ts` — `keyword()`, `parenList()`, `aliasDoc()`, `hardSep()`, `softSep()`,
  `commentsBlock()`, etc. Copied verbatim from tsql.
- `printer/helpers.ts` — `prop()`, `propArr()`, `propStr()`, `propBool()`, `rangeVarName()`

### Plugin wiring
- `index.ts` — registers parser `pgsql` and printer `pgsql-ast`
- `language.ts` — extensions `.sql`, `.pgsql`
- `options.ts` — same three options as tsql: `sqlKeywordCase`, `sqlDensity`, `sqlCommaStyle`

### Printer dispatch (`printer/index.ts`)
```ts
if (node.type === 'PgScript') return printScript(node, opts);
if (node.type.endsWith('Statement')) return printStatement(node, opts);
// else fall through to printExpression
```

### `printer/statements.ts`
Top-level statement printer. Implements SELECT, INSERT, UPDATE, DELETE, and DDL stubs.

**Critical**: always return `[join(hardline, parts), ';']` — never `join(...) + ';'`
(the `+` operator calls Array.toString() which gives `[object Object]` output).

### `printer/expressions.ts`
Expression/sub-expression printer. Dispatches on `node.type`.
Currently covers: Literal, ColumnRef, BinaryExpr, BoolExpr, FunctionCall, Cast, SubLink,
CaseExpr, NullTest, BooleanTest, ResTarget, RangeVar, JoinExpr, Subquery, RangeFunction,
SortItem, ColumnDef, Constraint, AlterCmd, FunctionParam, IndexElem, ArrayExpr, Coalesce,
RowExpr, ParamRef, ExprList, GroupingFunc, IntervalLiteral, RangeTableSample, TableLikeClause.

## SqlNode shape produced by AstBuilder

```
PgScript
  statements: SqlNode[]
    SelectStatement | InsertStatement | UpdateStatement | DeleteStatement |
    CreateTableStatement | AlterTableStatement | CreateViewStatement |
    CreateFunctionStatement | CreateIndexStatement | DropStatement | UnknownStatement

SelectStatement
  targetList: ResTarget[]
  from: (RangeVar | JoinExpr | Subquery | RangeFunction)[]
  where: BoolExpr | BinaryExpr | NullTest | ...
  groupBy: SqlNode[]
  having: SqlNode?
  orderBy: SortItem[]
  limit: SqlNode?
  offset: SqlNode?
  ctes: WithClause?
  distinct: true?
  all: true?

ResTarget
  name: string?     -- alias (SELECT expr AS name)
  val: SqlNode?

RangeVar
  schema: string?
  name: string
  alias: string?

JoinExpr
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "NATURAL"
  lhs: SqlNode
  rhs: SqlNode
  on: SqlNode?
  using: SqlNode[]?

SortItem
  expr: SqlNode
  direction: "ASC" | "DESC" | null
```

## Build & test

```bash
npm run build        # dotnet publish + copy native + tsc
npm test             # vitest run
npm run test:watch   # vitest watch
```

## What's NOT yet implemented

- **Comment attachment** — libpg_query has a separate scan API; see `Parser.Scan()` in pgsqlparser
- **XMLELEMENT / XMLFOREST / XMLTABLE / XMLAGG** — XML construction and query functions
- **SQL/JSON functions** — `JSON_TABLE`, `JSON_QUERY`, `JSON_EXISTS`, `JSON_VALUE` (PostgreSQL 16+)
- **Procedural / PL/pgSQL** — out of scope for now
- **Density-aware WHERE** — currently always inline; tsql has compact/standard/spacious logic
- **Leading comma style** — `sqlCommaStyle: 'leading'` is wired up in utils but not used in SELECT lists

## Patterns to follow from tsql

When adding a new node type:
1. Add a `BuildXxx` method in `AstBuilder.cs` that returns a `SqlNode` with the right `Type` string
2. Add the `Node.NodeOneofCase.Xxx => BuildXxx(...)` case in `BuildExpr` or `BuildFromItem`
3. Add a `case 'XxxNode': return printXxx(...)` in `expressions.ts` or `statements.ts`
4. Add a fixture `.sql` file in `tests/fixtures/<category>/`
5. Run `npm test` — first run writes the snapshot, subsequent runs assert it

Fixtures are auto-discovered; any `.sql` file under `tests/fixtures/` that doesn't end in
`.output.sql` becomes a test case.
