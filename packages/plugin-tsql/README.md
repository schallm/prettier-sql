# prettier-plugin-tsql

> **Beta** — covers the vast majority of T-SQL; a small number of less-common statements fall back to original source text (see [Pending implementation](#pending-implementation)). Breaking changes possible before 1.0.

A [Prettier](https://prettier.io) plugin that formats T-SQL (SQL Server) using Microsoft's official `Microsoft.SqlServer.TransactSql.ScriptDom` parser — the same parser SQL Server itself uses.

**Requires [.NET 8+ Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)** to be installed on your machine (the SDK is not needed).

## Features

Parses T-SQL via the official ScriptDom library (no hand-rolled grammar). Configurable keyword casing, layout density, and comma style. Preserves `--` and `/* */` comments — trailing, leading, inside procedure bodies, between parameters and `AS`. Emits `go` batch separators where required. Integrates with editor extensions that support Prettier (VS Code, etc.).

**DML**

- [`SELECT`](docs/examples.md#select-with-joins-and-where), [`INSERT`](docs/examples.md#insert), [`UPDATE`](docs/examples.md#update-with-join), [`DELETE`](docs/examples.md#delete-with-join)
- [`MERGE INTO … USING … ON … WHEN MATCHED/NOT MATCHED`](docs/examples.md#merge)
- `OUTPUT` / `OUTPUT INTO` on `INSERT`, `UPDATE`, `DELETE`, and `MERGE` (including `$action`, `inserted.*`, `deleted.*`)
- [CTEs](docs/examples.md#cte-with-window-function), `UNION`/`UNION ALL`, subqueries, derived tables
- [`EXISTS` / `NOT EXISTS`](docs/examples.md#exists), [`GROUP BY` / `HAVING`](docs/examples.md#group-by-and-having)
- [`CASE` expressions](docs/examples.md#case-expression) (simple and searched), [`IN`/`NOT IN`](docs/examples.md#in--not-in) (value lists and subqueries)
- `TOP (n)`, `TOP (n) PERCENT`, `TOP (n) WITH TIES`
- `PIVOT` / `UNPIVOT`
- `FOR XML` (`AUTO`, `PATH`, `RAW`, `EXPLICIT`, `XMLSCHEMA`, `ELEMENTS`, `ROOT`, `TYPE`, etc.) and `FOR JSON` (`AUTO`, `PATH`, `ROOT`, `INCLUDE_NULL_VALUES`, `WITHOUT_ARRAY_WRAPPER`)
- `TABLESAMPLE [SYSTEM] (n PERCENT|ROWS) [REPEATABLE(seed)]`
- Temporal table queries — `FOR SYSTEM_TIME AS OF`, `FROM … TO`, `BETWEEN … AND`, `CONTAINED IN`, `ALL`
- [Joins](docs/examples.md#join-types): `INNER`, `LEFT`, `RIGHT`, `FULL OUTER`, `CROSS JOIN`, `CROSS APPLY`, `OUTER APPLY`; multiple joins, multi-predicate `ON`, self-joins, parenthesized joins, derived table joins
- Table-valued functions (TVFs) in `FROM` clauses; table hints (`WITH (NOLOCK)`, etc.)
- [Window functions](docs/examples.md#window-functions-with-over) with `OVER` clause — `PARTITION BY`, `ORDER BY`, full frame support (`ROWS`/`RANGE BETWEEN … AND …`, `UNBOUNDED PRECEDING/FOLLOWING`, `CURRENT ROW`); `IGNORE NULLS`/`RESPECT NULLS`; named window references; named `WINDOW` clause
- Ordered set aggregates: `WITHIN GROUP (ORDER BY …)` for `STRING_AGG`, `PERCENTILE_CONT`/`PERCENTILE_DISC`, etc.
- Expression functions: `CAST`, `CONVERT`, `TRY_CAST`, `TRY_CONVERT` (with full data type including length/precision), `IIF`, `COALESCE`, `NULLIF`, `AT TIME ZONE`, `IS [NOT] DISTINCT FROM`, `TRIM(LEADING|TRAILING|BOTH …)`, `PARSE`, `TRY_PARSE`
- Sequence expressions: `NEXT VALUE FOR sequence [OVER (…)]`
- JSON functions: `JSON_OBJECT(key: value, …)`, `JSON_ARRAY(…)`, `JSON_ARRAYAGG(… ORDER BY …)` with `ABSENT|NULL ON NULL`
- Full-text predicates: `CONTAINS`/`FREETEXT` (single column, multi-column, wildcard, `LANGUAGE`); `CONTAINSTABLE`/`FREETEXTTABLE` as join sources
- Rowset functions: `OPENJSON` and `OPENXML` with `WITH` schema declarations; `OPENJSON` row-path and `AS JSON` columns; `OPENROWSET` provider and `OPENROWSET(BULK …)` forms
- Built-in functions formatted as standard function calls: `GREATEST`, `LEAST`, `DATE_BUCKET`, `DATETRUNC`, `GENERATE_SERIES`, `LEFT_SHIFT`, `RIGHT_SHIFT`, `BIT_COUNT`, `GET_BIT`, `SET_BIT`, `APPROX_PERCENTILE_CONT`, `APPROX_PERCENTILE_DISC`, `JSON_PATH_EXISTS`, `STRING_SPLIT`, `ISJSON`, `LTRIM`, `RTRIM`

**DDL**

- [`CREATE TABLE`](docs/examples.md#create-table) (columns, constraints, computed columns `AS expr [PERSISTED]`, `WITH` options such as `DATA_COMPRESSION`, `MEMORY_OPTIMIZED`), [`ALTER TABLE`](docs/examples.md#alter-table) (ADD/DROP column, ADD/DROP/ENABLE/DISABLE constraint, ALTER COLUMN, SET, REBUILD, SWITCH), `CREATE INDEX` (UNIQUE/CLUSTERED/NONCLUSTERED, ASC/DESC, INCLUDE), `ALTER INDEX … REBUILD/REORGANIZE/DISABLE`
- [`CREATE/ALTER/CREATE OR ALTER PROCEDURE`](docs/examples.md#create-procedure), `CREATE/ALTER/CREATE OR ALTER FUNCTION`, [`CREATE/ALTER/CREATE OR ALTER VIEW`](docs/examples.md#create-view)
- `CREATE/ALTER TRIGGER` (DML triggers: AFTER/INSTEAD OF INSERT/UPDATE/DELETE)
- `CREATE/ALTER/DROP SEQUENCE` with full options (START WITH, INCREMENT BY, MINVALUE/NO MINVALUE, MAXVALUE/NO MAXVALUE, CYCLE/NO CYCLE, CACHE/NO CACHE)
- `BULK INSERT … FROM … WITH (options)`
- `CREATE TYPE … FROM …` (scalar UDDTs) and `CREATE TYPE … AS TABLE (…)` (table-valued parameters)
- `CREATE SYNONYM` / `DROP SYNONYM` (with `IF EXISTS`)
- `CREATE SCHEMA` (with optional `AUTHORIZATION`), `ALTER SCHEMA … TRANSFER` (plain objects, `TYPE::`, `XML SCHEMA COLLECTION::`), `DROP SCHEMA` (with `IF EXISTS`)
- `CREATE PARTITION FUNCTION` (RANGE LEFT/RIGHT, boundary values), `ALTER PARTITION FUNCTION` (SPLIT/MERGE RANGE), `DROP PARTITION FUNCTION`
- `CREATE PARTITION SCHEME` (AS PARTITION, ALL TO / TO filegroup list), `ALTER PARTITION SCHEME` (NEXT USED), `DROP PARTITION SCHEME`
- `DROP TABLE/PROCEDURE/VIEW/FUNCTION/INDEX/TRIGGER/SEQUENCE/SYNONYM/SCHEMA` (with `IF EXISTS`)
- `DROP DATABASE` (with `IF EXISTS`, multiple databases)
- `CREATE DATABASE` (with optional `COLLATE`, file group specs, snapshot)
- `ALTER DATABASE` — `SET` (any option with proper keyword reconstruction), `COLLATE`, `MODIFY NAME`, `ADD/REMOVE FILE`, `ADD/REMOVE FILEGROUP`, `MODIFY FILE`, `MODIFY FILEGROUP`, `REBUILD LOG`, `SCOPED CONFIGURATION SET/CLEAR`

**Database Administration**

- `DBCC` commands — any command name, literal arguments, `WITH` options
- `BACKUP DATABASE` / `BACKUP LOG` — `TO DISK/TAPE/URL`, `MIRROR TO`, `WITH` options
- `RESTORE DATABASE` / `RESTORE LOG` / `RESTORE FILELISTONLY` / `RESTORE HEADERONLY` / `RESTORE VERIFYONLY` — `FROM DISK/TAPE/URL`, `WITH` options

**Procedural / Control Flow**

- `USE`, `SET NOCOUNT/ANSI_NULLS/QUOTED_IDENTIFIER/XACT_ABORT/…` ON/OFF, `SET IDENTITY_INSERT`, `SET TRANSACTION ISOLATION LEVEL`, `SET STATISTICS`, `WAITFOR DELAY/TIME`
- [`DECLARE`, `SET @var`](docs/examples.md#declare-and-variables), `SET ROWCOUNT`, `PRINT`, `RETURN`, `EXECUTE`, `TRUNCATE TABLE`
- [`IF`/`ELSE`](docs/examples.md#if--else), `WHILE`, `BREAK`, `CONTINUE`, `GOTO`/label, `THROW`, `RAISERROR`, `TRY/CATCH`
- `BEGIN`/`COMMIT`/`ROLLBACK TRANSACTION`
- `DECLARE CURSOR` / `OPEN` / `FETCH NEXT/PRIOR/FIRST/LAST/ABSOLUTE/RELATIVE` / `CLOSE` / `DEALLOCATE`
- `EXECUTE AS` (CALLER / USER / LOGIN / SELF / OWNER, with `WITH NO REVERT`) / `REVERT`
- `CREATE/ALTER PROCEDURE` and `CREATE/ALTER FUNCTION` `WITH` options: `ENCRYPTION`, `RECOMPILE`, `EXECUTE AS`

**Security**

- [`GRANT` / `DENY` / `REVOKE`](docs/examples.md#grant--deny--revoke) — all securable classes (OBJECT, SCHEMA, DATABASE, SERVER, LOGIN, USER, ROLE, ASSEMBLY, …), column lists, WITH GRANT OPTION, CASCADE, GRANT OPTION FOR, AS clause, multiple principals
- `CREATE/ALTER/DROP USER` — FOR LOGIN, WITHOUT LOGIN, FROM EXTERNAL PROVIDER, WITH options
- `CREATE/ALTER/DROP LOGIN` — password (HASHED/MUST_CHANGE), FROM WINDOWS, FROM CERTIFICATE/ASYMMETRIC KEY, ENABLE/DISABLE, ADD/DROP CREDENTIAL
- `CREATE/ALTER/DROP ROLE` — AUTHORIZATION owner, ADD/DROP MEMBER, WITH NAME rename

## Pending implementation

The constructs below are parsed correctly but emitted as-is (original source text preserved). Open a ticket to request formatting support for any of these.

### DDL object model

- Ledger table syntax — `CREATE TABLE ... WITH (LEDGER = ON, ...)` table options
- Assemblies (`CREATE/ALTER/DROP ASSEMBLY`)
- XML schema collections (`CREATE/ALTER/DROP XML SCHEMA COLLECTION`)
- Full-text catalogs and indexes (`CREATE/ALTER/DROP FULLTEXT CATALOG`, `CREATE/ALTER/DROP FULLTEXT INDEX`)

### Service Broker

- `CREATE/ALTER/DROP QUEUE`, `SEND`, `RECEIVE`, `CREATE/ALTER/DROP SERVICE`, `CREATE/ALTER/DROP CONTRACT`, `CREATE/ALTER/DROP MESSAGE TYPE`, `CREATE/ALTER/DROP ROUTE`

### Extended Events

- `CREATE/ALTER/DROP EVENT SESSION`

### Cryptography

- `CREATE/ALTER/DROP CERTIFICATE`, `CREATE/ALTER/DROP SYMMETRIC KEY`, `CREATE/ALTER/DROP ASYMMETRIC KEY`, `OPEN/CLOSE MASTER KEY`

### High Availability

- `CREATE/ALTER/DROP AVAILABILITY GROUP`, `CREATE/ALTER/DROP ENDPOINT`

### External Data

- `CREATE/ALTER/DROP EXTERNAL TABLE`, `CREATE/ALTER/DROP EXTERNAL DATA SOURCE`, `CREATE/ALTER/DROP EXTERNAL FILE FORMAT`, `CREATE/ALTER/DROP EXTERNAL RESOURCE POOL`

### Audit

- `CREATE/ALTER/DROP SERVER AUDIT`, `CREATE/ALTER/DROP DATABASE AUDIT SPECIFICATION`, `CREATE/ALTER/DROP SERVER AUDIT SPECIFICATION`

## Requirements

- Node.js 20+
- [.NET 8+ Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (the SDK is only needed for building from source)
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

| Option           | Default    | Choices                           |
| ---------------- | ---------- | --------------------------------- |
| `sqlKeywordCase` | `lower`    | `upper`, `lower`, `preserve`      |
| `sqlDensity`     | `standard` | `compact`, `standard`, `spacious` |
| `sqlCommaStyle`  | `trailing` | `trailing`, `leading`             |

See [docs/options.md](docs/options.md) for full details and examples.

## Quick Example

See [docs/examples.md](docs/examples.md) for more before/after transformations.

**Input**

<!-- prettier-ignore -->
```sql
SELECT Books.BookId,Books.Title,Books.Price,Authors.LastName FROM Books INNER JOIN Authors ON Books.AuthorId=Authors.Id WHERE Books.InStock=1 ORDER BY Books.Title ASC;
```

**Output** (default options)

```sql
select
    Books.BookId,
    Books.Title,
    Books.Price,
    Authors.LastName
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
where Books.InStock = 1
order by Books.Title asc;
```

## Documentation

- [Getting Started](docs/getting-started.md) — installation, build from source, editor setup
- [Options Reference](docs/options.md) — all options with before/after examples
- [Formatting Rules](docs/formatting.md) — how each SQL construct is formatted
- [Examples](docs/examples.md) — before/after transformations for common SQL patterns
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
