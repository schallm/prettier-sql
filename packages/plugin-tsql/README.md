# prettier-plugin-tsql

A [Prettier](https://prettier.io) plugin that formats T-SQL (SQL Server) using Microsoft's official `Microsoft.SqlServer.TransactSql.ScriptDom` parser — the same parser SQL Server itself uses.

## Features

- Parses T-SQL via the official ScriptDom library (no hand-rolled grammar)
- Formats SELECT, INSERT, UPDATE, DELETE, CREATE/ALTER TABLE, CREATE PROCEDURE, CREATE FUNCTION, CREATE/ALTER VIEW
- CTEs, window functions, derived tables, subqueries, UNION/UNION ALL, CASE expressions (simple and searched), IN/NOT IN, nested joins
- Table-valued functions (TVFs) in FROM clauses
- Expression functions: `CAST`, `CONVERT`, `TRY_CAST`, `TRY_CONVERT` (with full data type including length/precision), `IIF`, `COALESCE`, `NULLIF`, `AT TIME ZONE`
- Table hints (`WITH (NOLOCK)`, etc.), control-flow (`IF`, `WHILE`, `DECLARE`, `EXECUTE`, transactions), `SET ROWCOUNT`
- Preserves `--` and `/* */` comments — trailing, leading, inside procedure bodies, between parameters and `AS`
- Configurable keyword casing, layout density, and comma style
- Control flow: `BREAK`, `CONTINUE`, `GOTO`/label, `THROW`, `RAISERROR`, `TRY/CATCH`
- DDL: `TRUNCATE TABLE`, `DROP TABLE/PROCEDURE/VIEW/FUNCTION/INDEX` (with `IF EXISTS`), `CREATE OR ALTER PROCEDURE`
- `MERGE INTO ... USING ... ON ... WHEN MATCHED/NOT MATCHED THEN UPDATE/INSERT/DELETE` (with optional `AND` predicates)
- `OUTPUT` / `OUTPUT INTO` clause on INSERT, UPDATE, DELETE, and MERGE (including `$action`, `inserted.*`, `deleted.*`)
- Full-text predicates: `CONTAINS` / `FREETEXT` (single column, multi-column, wildcard `*`, `LANGUAGE` term); `CONTAINSTABLE` / `FREETEXTTABLE` as join sources
- Emits `go` batch separators where required
- Integrates with editor extensions that support Prettier (VS Code, etc.)

## Passthrough constructs

The following T-SQL constructs are recognised by the parser but emitted unchanged (their original source text is preserved):

- Rowset functions used as table sources (`OPENROWSET`, `OPENXML`, `OPENJSON`)

## Requirements

- Node.js 18+
- .NET 8.0 SDK
- Prettier 3.x (peer dependency)

## Installation

```bash
npm install --save-dev prettier-plugin-tsql prettier
```

> The package ships with the compiled .NET DLL — no separate `dotnet` build step is needed when installing from npm.

## Configuration

Add the plugin to your Prettier config:

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-tsql'],
  sqlKeywordCase: 'lower',
  sqlDensity: 'standard',
  sqlCommaStyle: 'trailing',
};
```

Or in `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-tsql"],
  "sqlKeywordCase": "lower",
  "sqlDensity": "standard",
  "sqlCommaStyle": "trailing"
}
```

## Options

| Option | Default | Choices |
|---|---|---|
| `sqlKeywordCase` | `lower` | `upper`, `lower`, `preserve` |
| `sqlDensity` | `standard` | `compact`, `standard`, `spacious` |
| `sqlCommaStyle` | `trailing` | `trailing`, `leading` |

See [docs/options.md](docs/options.md) for full details and examples.

## Quick Example

**Input**
```sql
select b.book_id,b.title,b.price from dbo.Books as b inner join dbo.Authors as a on b.author_id=a.author_id where b.in_stock=1 order by b.title asc
```

**Output** (default options)
```sql
select
  b.book_id,
  b.title,
  b.price
from
  dbo.Books as b
  inner join dbo.Authors as a on b.author_id = a.author_id
where b.in_stock = 1
order by b.title asc;
```

## Documentation

- [Getting Started](docs/getting-started.md) — installation, build from source, editor setup
- [Options Reference](docs/options.md) — all options with before/after examples
- [Formatting Rules](docs/formatting.md) — how each SQL construct is formatted
- [Architecture](docs/architecture.md) — how the plugin works internally

## Building from Source

```bash
git clone <repo>
cd prettier-plugin-tsql
npm install
npm run build      # builds .NET DLL and TypeScript
npm test
```

See [Getting Started](docs/getting-started.md) for full details.
