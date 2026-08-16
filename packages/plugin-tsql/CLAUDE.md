# prettier-plugin-tsql — Developer Guide for Claude

## What this project is

A Prettier plugin for T-SQL (Transact-SQL / SQL Server). Part of the `prettier-sql` monorepo.
See the root `CLAUDE.md` for the full monorepo structure and shared code in `@prettier-sql/core`.

## Architecture

```
SQL string
  → C# (SqlScriptDom.dll via node-api-dotnet)
      SqlParser.Parse(sql)
        → TSql180Parser produces a ScriptDOM parse tree
        → AstBuilder visits the tree via TSqlFragmentVisitor, emits SqlNode JSON
        → ScriptTokenStream filtered for comment tokens
        → JSON: { ast: SqlNode, comments: CommentToken[] }
  → TypeScript (Prettier plugin)
      parser/index.ts receives JSON, calls attachComments() to attach
        comment tokens to the nearest statement node
      printer/ dispatches on node.type → Prettier Doc
  → Formatted SQL string
```

### Key difference from pgsql

T-SQL uses ScriptDOM's `TSqlFragmentVisitor` base class — override `ExplicitVisit(SomeNode node)`
and ScriptDOM calls you during `fragment.Accept(builder)`. PostgreSQL has no visitor;
`AstBuilder.cs` manually switches on `Node.NodeCase` and recurses explicitly.

## C# project — `src/dotnet/SqlScriptDom/`

### `SqlParser.cs`

Parses with `TSql180Parser(initialQuotedIdentifiers: false)`.
Collects comments from `fragment.ScriptTokenStream` filtering for
`TSqlTokenType.SingleLineComment` and `TSqlTokenType.MultilineComment`.
Uses `using PrettierSql.Core;` for the shared `SqlNode` record.

### `AstBuilder.cs`

Extends `TSqlFragmentVisitor` (for its `StartOffset`/`FragmentLength` helpers), but
dispatch is a single pattern-match `switch` over `TSqlStatement` subtypes in
`BuildStatement`, not `ExplicitVisit` overrides — ScriptDOM's visitor pattern isn't used
for the actual tree walk:

```csharp
private static SqlNode? BuildStatement(TSqlStatement stmt) => stmt switch {
    SelectStatement sel => BuildSelectStatement(sel),
    InsertStatement ins => BuildInsertStatement(ins),
    ...
    _ => Leaf("Statement", stmt, RawText(stmt)), // unhandled kinds preserve original text
};
```

Key helpers:

```csharp
private static SqlNode Leaf(string type, TSqlFragment f, string? text = null)
private static SqlNode Node(string type, TSqlFragment f, Dictionary<string, object?> props)
private static List<object?>? MapList<T>(IList<T>? items, Func<T, object?> map)
private static string RawText(TSqlFragment f) // reconstructs SQL text via ScriptTokenStream
```

There is no `BuildProps` helper in this file (that's pgsql's `AstBuilder.cs`) — build the
`Dictionary<string, object?>` literal directly and pass it to `Node(...)`; the JSON
serializer drops null values on its own (`DefaultIgnoreCondition = WhenWritingNull` in
`SqlParser.cs`), so there's nothing to filter manually.

## TypeScript project — `src/plugin/`

### Imports from @prettier-sql/core

Shared types and utilities come from the core package — do not duplicate them locally:

| What                                                                                        | Import from                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `SqlNode`, `CommentToken`                                                                   | `@prettier-sql/core/types`           |
| `sqlKeywordCase`, `sqlDensity`, `sqlCommaStyle` options                                     | `@prettier-sql/core/options`         |
| `keyword()`, `parenList()`, `aliasDoc()`, `hardSep()`, `softSep()`, `commentsBlock()`, etc. | `@prettier-sql/core/printer/utils`   |
| `prop()`, `propArr()`, `propStr()`, `propBool()`                                            | `@prettier-sql/core/printer/helpers` |

### Dialect-specific helpers (`src/plugin/printer/helpers.ts`)

Imports and re-exports the core helpers, then adds tsql-specific ones:

- `schemaObjectName(nameNode)` — formats a four-part `[server].[db].[schema].[object]` name
- `assignmentOp(op)` — maps T-SQL compound assignment operators (`+=`, `-=`, etc.)

### Plugin wiring

- `index.ts` — registers parser `tsql` and printer `tsql-ast`
- `language.ts` — extensions `.sql`, `.tsql`

### Printer files

The printer is split into multiple files for manageability:

| File                     | What it handles                                        |
| ------------------------ | ------------------------------------------------------ |
| `printer/index.ts`       | Top-level dispatch: script → statement → expression    |
| `printer/statements.ts`  | SELECT, INSERT, UPDATE, DELETE, MERGE                  |
| `printer/expressions.ts` | All expression node types                              |
| `printer/ddl.ts`         | CREATE/ALTER/DROP TABLE, VIEW, INDEX, SCHEMA           |
| `printer/admin.ts`       | SET statements, USE, EXEC, BACKUP/RESTORE              |
| `printer/procedural.ts`  | IF/ELSE, WHILE, BEGIN/END, TRY/CATCH, DECLARE, cursors |
| `printer/security.ts`    | GRANT, DENY, REVOKE, CREATE LOGIN/USER                 |

### `printer/statements.ts`

**Critical**: always return `[join(hardline, parts), ';']` — never `join(...) + ';'`
(the `+` operator calls Array.toString() which gives `[object Object]` output).

### Shared test fixtures

The test harness runs both dialect-specific fixtures from `tests/fixtures/` and shared
fixtures from `packages/core/tests/fixtures/shared/`. The `sharedDir` path in
`tests/fixtures.test.ts` resolves to `../../core/tests/fixtures/shared`.

## Build & test

```bash
pnpm run build        # dotnet publish + copy native + tsc
pnpm run test         # vitest run
pnpm run test:watch   # vitest watch
```

## Adding a new node type

1. Add a `BuildXxx(...)` method in `AstBuilder.cs` and a `case XxxStatement x => BuildXxx(x),` arm in the `BuildStatement` switch (or wherever the relevant sub-dispatch lives)
2. Add a `case 'XxxNode': return printXxx(...)` in the appropriate printer file
3. Add a fixture `.sql` file in `tests/fixtures/<category>/`
4. Run `pnpm run test` — first run writes the snapshot, subsequent runs assert it

Fixtures are auto-discovered; any `.sql` file under `tests/fixtures/` that doesn't end in
`.output.sql` becomes a test case.
