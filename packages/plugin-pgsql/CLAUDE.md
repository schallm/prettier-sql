# prettier-plugin-pgsql — Developer Guide for Claude

## What this project is

A Prettier plugin for PostgreSQL SQL. Part of the `prettier-sql` monorepo.
See the root `CLAUDE.md` for the full monorepo structure and shared code in `@prettier-sql/core`.

## Architecture

```
SQL string
  → C# (PgScriptDom.dll via node-api-dotnet)
      SqlParser.Parse(sql)
        → pgsqlparser (libpg_query .NET wrapper) produces a protobuf parse tree
        → AstBuilder walks the tree, emits SqlNode JSON
        → Parser.Scan(sql) extracts comment tokens (SqlComment, CComment)
        → JSON: { ast: SqlNode, comments?: CommentToken[] }
  → TypeScript (Prettier plugin)
      parser/index.ts receives JSON, calls attachComments() to attach
        comment tokens to the nearest statement node
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
Also calls `Parser.Scan(sql)` to extract comment tokens and includes them in the JSON output.

### `AstBuilder.cs`
Walks the `ParseResult.Stmts` list. Each `RawStmt` has a `Stmt` (`Node`) with a `NodeCase` oneof.
Uses `using PrettierSql.Core;` for the shared `SqlNode` record.

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

### Imports from @prettier-sql/core

Shared types and utilities come from the core package — do not duplicate them locally:

| What | Import from |
|---|---|
| `SqlNode`, `CommentToken` | `@prettier-sql/core/types` |
| `sqlKeywordCase`, `sqlDensity`, `sqlCommaStyle` options | `@prettier-sql/core/options` |
| `keyword()`, `parenList()`, `aliasDoc()`, `hardSep()`, `softSep()`, `commentsBlock()`, etc. | `@prettier-sql/core/printer/utils` |
| `prop()`, `propArr()`, `propStr()`, `propBool()` | `@prettier-sql/core/printer/helpers` |

### Dialect-specific helpers (`src/plugin/printer/helpers.ts`)

Imports and re-exports the core helpers, then adds pgsql-specific ones:
- `rangeVarName(node)` — formats `schema.table` from a `RangeVar` node
- `qualifiedName(schema, name)` — formats a possibly-schema-qualified name

### Plugin wiring
- `index.ts` — registers parser `pgsql` and printer `pgsql-ast`
- `language.ts` — extensions `.sql`, `.pgsql`

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
RowExpr, ParamRef, ExprList, GroupingFunc, IntervalLiteral, RangeTableSample, TableLikeClause,
XmlExpr, JsonFuncExpr.

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
pnpm run build        # dotnet publish + copy native + tsc
pnpm run test         # vitest run
pnpm run test:watch   # vitest watch
```

## What's NOT yet implemented

- **XMLTABLE** — `XMLTABLE(xpath COLUMNS ...)` tabular XML query; complex dedicated parse node
- **JSON_TABLE** — `JSON_TABLE(data, path COLUMNS ...)` PostgreSQL 16+; complex dedicated parse node
- **Procedural / PL/pgSQL** — out of scope for now
- **Density-aware WHERE** — currently always inline; tsql has compact/standard/spacious logic
- **Leading comma style** — `sqlCommaStyle: 'leading'` is wired up in utils but not used in SELECT lists

## Adding a new node type

1. Add a `BuildXxx` method in `AstBuilder.cs` that returns a `SqlNode` with the right `Type` string
2. Add the `Node.NodeOneofCase.Xxx => BuildXxx(...)` case in `BuildExpr` or `BuildFromItem`
3. Add a `case 'XxxNode': return printXxx(...)` in `expressions.ts` or `statements.ts`
4. Add a fixture `.sql` file in `tests/fixtures/<category>/`
5. Run `pnpm run test` — first run writes the snapshot, subsequent runs assert it

Fixtures are auto-discovered; any `.sql` file under `tests/fixtures/` that doesn't end in
`.output.sql` becomes a test case. Shared dialect-agnostic fixtures live in
`packages/core/tests/fixtures/shared/` and are run automatically by the test harness.
