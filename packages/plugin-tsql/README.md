# prettier-plugin-tsql

A [Prettier](https://prettier.io) plugin that formats T-SQL (SQL Server) using Microsoft's official `Microsoft.SqlServer.TransactSql.ScriptDom` parser — the same parser SQL Server itself uses.

## Features

Parses T-SQL via the official ScriptDom library (no hand-rolled grammar). Configurable keyword casing, layout density, and comma style. Preserves `--` and `/* */` comments — trailing, leading, inside procedure bodies, between parameters and `AS`. Emits `go` batch separators where required. Integrates with editor extensions that support Prettier (VS Code, etc.).

**DML**

- `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE INTO … USING … ON … WHEN MATCHED/NOT MATCHED`
- `OUTPUT` / `OUTPUT INTO` on INSERT, UPDATE, DELETE, and MERGE (including `$action`, `inserted.*`, `deleted.*`)
- CTEs, window functions, derived tables, subqueries, `UNION`/`UNION ALL`, `CASE` expressions (simple and searched), `IN`/`NOT IN`, nested joins
- Table-valued functions (TVFs) in `FROM` clauses; table hints (`WITH (NOLOCK)`, etc.)
- Expression functions: `CAST`, `CONVERT`, `TRY_CAST`, `TRY_CONVERT` (with full data type including length/precision), `IIF`, `COALESCE`, `NULLIF`, `AT TIME ZONE`
- Full-text predicates: `CONTAINS` / `FREETEXT` (single column, multi-column, wildcard, `LANGUAGE`); `CONTAINSTABLE` / `FREETEXTTABLE` as join sources
- Rowset functions: `OPENJSON` and `OPENXML` with `WITH` schema declarations; `OPENJSON` row-path and `AS JSON` columns; `OPENROWSET` provider form (single provider-string or three-part datasource/userid/password) and `OPENROWSET(BULK ...)` form

**DDL**

- `CREATE TABLE`, `ALTER TABLE` (ADD/DROP column), `CREATE INDEX` (UNIQUE/CLUSTERED/NONCLUSTERED, ASC/DESC, INCLUDE), `ALTER INDEX … REBUILD/REORGANIZE/DISABLE`
- `CREATE/ALTER/CREATE OR ALTER PROCEDURE`, `CREATE/ALTER/CREATE OR ALTER FUNCTION`, `CREATE/ALTER/CREATE OR ALTER VIEW`
- `CREATE/ALTER TRIGGER` (DML triggers: AFTER/INSTEAD OF INSERT/UPDATE/DELETE)
- `CREATE/ALTER/DROP SEQUENCE` with full options (START WITH, INCREMENT BY, MINVALUE/NO MINVALUE, MAXVALUE/NO MAXVALUE, CYCLE/NO CYCLE, CACHE/NO CACHE)
- `BULK INSERT … FROM … WITH (options)`
- `CREATE TYPE … FROM …` (scalar UDDTs) and `CREATE TYPE … AS TABLE (…)` (table-valued parameters)
- `DROP TABLE/PROCEDURE/VIEW/FUNCTION/INDEX/TRIGGER/SEQUENCE` (with `IF EXISTS`)
- `DROP DATABASE` (with `IF EXISTS`, multiple databases)
- `CREATE DATABASE` (with optional `COLLATE`, file group specs, snapshot)
- `ALTER DATABASE` — `SET` (any option with proper keyword reconstruction), `COLLATE`, `MODIFY NAME`, `ADD/REMOVE FILE`, `ADD/REMOVE FILEGROUP`, `MODIFY FILE`, `MODIFY FILEGROUP`, `REBUILD LOG`, `SCOPED CONFIGURATION SET/CLEAR`

**Database Administration**

- `DBCC` commands — any command name, literal arguments, `WITH` options
- `BACKUP DATABASE` / `BACKUP LOG` — `TO DISK/TAPE/URL`, `MIRROR TO`, `WITH` options
- `RESTORE DATABASE` / `RESTORE LOG` / `RESTORE FILELISTONLY` / `RESTORE HEADERONLY` / `RESTORE VERIFYONLY` — `FROM DISK/TAPE/URL`, `WITH` options

**Procedural / Control Flow**

- `USE`, `SET NOCOUNT/ANSI_NULLS/QUOTED_IDENTIFIER/XACT_ABORT/…` ON/OFF, `SET IDENTITY_INSERT`, `SET TRANSACTION ISOLATION LEVEL`, `SET STATISTICS`, `WAITFOR DELAY/TIME`
- `DECLARE`, `SET @var`, `SET ROWCOUNT`, `PRINT`, `RETURN`, `EXECUTE`, `TRUNCATE TABLE`
- `IF`/`ELSE`, `WHILE`, `BREAK`, `CONTINUE`, `GOTO`/label, `THROW`, `RAISERROR`, `TRY/CATCH`
- `BEGIN`/`COMMIT`/`ROLLBACK TRANSACTION`
- `DECLARE CURSOR` / `OPEN` / `FETCH NEXT/PRIOR/FIRST/LAST/ABSOLUTE/RELATIVE` / `CLOSE` / `DEALLOCATE`

**Security**

- `GRANT` / `DENY` / `REVOKE` — all securable classes (OBJECT, SCHEMA, DATABASE, SERVER, LOGIN, USER, ROLE, ASSEMBLY, …), column lists, WITH GRANT OPTION, CASCADE, GRANT OPTION FOR, AS clause, multiple principals
- `CREATE/ALTER/DROP USER` — FOR LOGIN, WITHOUT LOGIN, FROM EXTERNAL PROVIDER, WITH options
- `CREATE/ALTER/DROP LOGIN` — password (HASHED/MUST_CHANGE), FROM WINDOWS, FROM CERTIFICATE/ASYMMETRIC KEY, ENABLE/DISABLE, ADD/DROP CREDENTIAL
- `CREATE/ALTER/DROP ROLE` — AUTHORIZATION owner, ADD/DROP MEMBER, WITH NAME rename

## Pending implementation

The constructs below are parsed correctly but emitted as-is (original source text preserved). PRs welcome.

- Service Broker statements (`CREATE QUEUE`, `SEND`, `RECEIVE`, `CREATE SERVICE`, etc.)
- Extended Events (`CREATE EVENT SESSION`, `ALTER EVENT SESSION`, etc.)
- Cryptography (`CREATE CERTIFICATE`, `CREATE SYMMETRIC KEY`, `CREATE ASYMMETRIC KEY`, `OPEN/CLOSE MASTER KEY`, etc.)
- Availability Group DDL (`CREATE/ALTER/DROP AVAILABILITY GROUP`)
- External data (`CREATE EXTERNAL TABLE`, `CREATE EXTERNAL DATA SOURCE`, `CREATE EXTERNAL FILE FORMAT`, etc.)
- Database audit (`CREATE/ALTER SERVER AUDIT`, `CREATE/ALTER DATABASE AUDIT SPECIFICATION`, etc.)

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
  plugins: ["prettier-plugin-tsql"],
  sqlKeywordCase: "lower",
  sqlDensity: "standard",
  sqlCommaStyle: "trailing",
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

| Option           | Default    | Choices                           |
| ---------------- | ---------- | --------------------------------- |
| `sqlKeywordCase` | `lower`    | `upper`, `lower`, `preserve`      |
| `sqlDensity`     | `standard` | `compact`, `standard`, `spacious` |
| `sqlCommaStyle`  | `trailing` | `trailing`, `leading`             |

See [docs/options.md](docs/options.md) for full details and examples.

## Quick Example

**Input**

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
