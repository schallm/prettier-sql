# prettier-plugin-pgsql

> **Beta** — covers the core PostgreSQL DML and DDL statement set. A small number of advanced or uncommon constructs fall back to a `/* unknown */` comment placeholder while support is being added.

A [Prettier](https://prettier.io) plugin for PostgreSQL SQL. Parses SQL with [libpg_query](https://github.com/pganalyze/libpg_query) (the actual PostgreSQL parser) and formats it using Prettier's document IR for consistent, readable output.

---

## Features

### DML

- **SELECT** — column lists, table aliases, all JOIN types (INNER, LEFT, RIGHT, FULL, CROSS, NATURAL), WHERE, GROUP BY / HAVING, ORDER BY, LIMIT / OFFSET, DISTINCT, DISTINCT ON
- **Set operations** — UNION / UNION ALL / INTERSECT / EXCEPT
- **Subqueries** — correlated subqueries, EXISTS, scalar sublinks, LATERAL
- **CTEs** — WITH / WITH RECURSIVE, data-modifying CTEs (WITH ... DELETE/INSERT/UPDATE)
- **Window functions** — OVER (PARTITION BY, ORDER BY, frame clauses: ROWS/RANGE/GROUPS BETWEEN)
- **Aggregate functions** — FILTER (WHERE ...), ORDER BY inside aggregate (e.g. `string_agg`)
- **GROUP BY extensions** — ROLLUP, CUBE, GROUPING SETS
- **Locking** — FOR UPDATE / FOR SHARE / FOR NO KEY UPDATE / FOR KEY SHARE with OF, NOWAIT, SKIP LOCKED
- **INSERT** — VALUES (single and multi-row), DEFAULT VALUES, ON CONFLICT DO NOTHING / DO UPDATE SET, RETURNING, OVERRIDING USER/SYSTEM VALUE, WITH clause
- **UPDATE** — SET, FROM, WHERE, RETURNING, WITH clause
- **DELETE** — WHERE, RETURNING, WITH clause
- **TRUNCATE** — with RESTART IDENTITY and CASCADE
- **Transaction control** — BEGIN / START TRANSACTION / COMMIT / ROLLBACK / SAVEPOINT / RELEASE SAVEPOINT / ROLLBACK TO SAVEPOINT / SET TRANSACTION (isolation level, READ ONLY/WRITE, DEFERRABLE) / PREPARE TRANSACTION / COMMIT PREPARED / ROLLBACK PREPARED
- **MERGE** — WHEN MATCHED / WHEN NOT MATCHED / WHEN NOT MATCHED BY SOURCE; UPDATE SET, INSERT, DELETE, DO NOTHING actions; conditional AND clause; RETURNING
- **CALL** — stored-procedure invocation

### DDL

- **CREATE TABLE** — column definitions with full constraint support: NOT NULL, DEFAULT, PRIMARY KEY, FOREIGN KEY (column-level and table-level, with ON UPDATE/DELETE actions), CHECK, UNIQUE, GENERATED ALWAYS AS (stored), GENERATED AS IDENTITY, named constraints; type modifiers (`VARCHAR(100)`, `NUMERIC(10,2)`), array types (`TEXT[]`)
- **ALTER TABLE** — ADD COLUMN, DROP COLUMN, ADD CONSTRAINT
- **CREATE VIEW**
- **CREATE INDEX** / CREATE UNIQUE INDEX
- **CREATE FUNCTION** — RETURNS, LANGUAGE, dollar-quoted `$$...$$` body, parameter lists with modes (IN, OUT, INOUT)
- **DROP** — TABLE, VIEW, INDEX, FUNCTION

### Expressions

- **SQL standard functions** — `SUBSTRING(str FROM pattern)`, `EXTRACT(field FROM expr)`, `TRIM(LEADING/TRAILING/BOTH ... FROM str)`, `POSITION(x IN y)`, `expr AT TIME ZONE tz`, `OVERLAY(...)`
- **Type casting** — `expr::type` (PostgreSQL style), `INTERVAL '1 day'` literals
- **Array subscripts** — `arr[1]`, `arr[2:4]`, `arr[:3]`
- **Named arguments** — `func(param => value)`
- **Conditional** — CASE / WHEN / THEN / ELSE, COALESCE, NULLIF, GREATEST, LEAST
- **Predicates** — IN / NOT IN, BETWEEN / NOT BETWEEN, LIKE / NOT LIKE, ILIKE / NOT ILIKE, SIMILAR TO, IS NULL / IS NOT NULL, IS DISTINCT FROM, ANY / ALL
- **SQL value functions** — CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_USER, SESSION_USER, LOCALTIME, LOCALTIMESTAMP, and others

### Pending Implementation

Ordered by estimated real-world impact. Items in **P4** are specialist or rare.

#### P2 — Common production patterns

| Feature | Notes |
|---|---|
| **GRANT / REVOKE** | All securable classes: TABLE, SEQUENCE, FUNCTION, SCHEMA, DATABASE, etc. |
| **CREATE / ALTER / DROP ROLE** | User and role management |
| **SET / SHOW / RESET** | Configuration: `SET search_path = myschema`, `SHOW work_mem`, `RESET ALL` |
| **ALTER TABLE** extensions | RENAME COLUMN, ALTER COLUMN TYPE, SET/DROP DEFAULT, SET/DROP NOT NULL, RENAME TABLE |
| **CREATE TYPE** | Composite (`AS (...)`), enum (`AS ENUM (...)`), range, base |
| **ALTER TYPE** | ADD VALUE for enums; ADD ATTRIBUTE / DROP ATTRIBUTE for composite types |
| **CREATE / ALTER SEQUENCE** | `START WITH`, `INCREMENT BY`, `MINVALUE`, `MAXVALUE`, `CYCLE` |
| **CREATE SCHEMA** | `CREATE SCHEMA [IF NOT EXISTS] name [AUTHORIZATION role]` |
| **CREATE EXTENSION** | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` |
| **CREATE TABLE AS** | `CREATE TABLE foo AS SELECT ...` and `CREATE MATERIALIZED VIEW` |
| **Named WINDOW clauses** | `SELECT ... WINDOW w AS (PARTITION BY ...)` in SELECT |
| **CREATE TRIGGER** | `CREATE TRIGGER ... BEFORE/AFTER ... ON ... FOR EACH ROW EXECUTE ...` |
| **COMMENT ON** | `COMMENT ON TABLE / COLUMN / FUNCTION / ...` |

#### P3 — Moderate usage

| Feature | Notes |
|---|---|
| **ALTER FUNCTION / PROCEDURE** | Change volatility, cost, parallel safety, rename, set options |
| **REFRESH MATERIALIZED VIEW** | `REFRESH MATERIALIZED VIEW [CONCURRENTLY] name` |
| **SELECT INTO** | `SELECT ... INTO [TEMP] table` |
| **CREATE RULE** | `CREATE RULE name AS ON event TO table DO [ALSO/INSTEAD] ...` |
| **Row Security Policies** | `CREATE / ALTER / DROP POLICY` |
| **Cursors** | `DECLARE CURSOR`, `FETCH`, `MOVE`, `CLOSE` |
| **COPY** | `COPY table FROM/TO` — bulk data loading and export |
| **EXPLAIN** | `EXPLAIN [ANALYZE] [VERBOSE] [FORMAT JSON] stmt` |
| **PREPARE / EXECUTE / DEALLOCATE** | Server-side prepared statements |
| **LISTEN / UNLISTEN / NOTIFY** | Async pub/sub: `LISTEN channel`, `NOTIFY channel, 'payload'` |
| **LOCK TABLE** | `LOCK TABLE t IN ACCESS EXCLUSIVE MODE` |
| **DO** | Anonymous PL/pgSQL blocks: `DO $$ BEGIN ... END $$` |
| **GROUPING()** | `GROUPING(col)` predicate used alongside GROUPING SETS |
| **NEXT VALUE FOR** | `NEXT VALUE FOR sequence_name` sequence expression |

#### P4 — Specialist / Advanced

| Feature | Notes |
|---|---|
| **Table partitioning** | `PARTITION BY RANGE/LIST/HASH`, `CREATE TABLE ... PARTITION OF`, partition bounds |
| **TABLESAMPLE** | `FROM t TABLESAMPLE BERNOULLI(10)` / `SYSTEM(10)` |
| **CREATE TABLE LIKE** | `CREATE TABLE new LIKE existing INCLUDING ALL` |
| **Recursive CTE extensions** | `SEARCH BREADTH/DEPTH FIRST BY col`, `CYCLE col SET ...` |
| **INTERVAL field modifiers** | `INTERVAL '1:30' HOUR TO MINUTE`, precision on INTERVAL |
| **VACUUM / ANALYZE / CLUSTER / REINDEX** | Maintenance statements |
| **Foreign data wrappers** | `CREATE SERVER`, `CREATE FOREIGN TABLE`, `CREATE USER MAPPING`, `IMPORT FOREIGN SCHEMA` |
| **Logical replication** | `CREATE / ALTER / DROP PUBLICATION` and `SUBSCRIPTION` |
| **CREATE AGGREGATE** | `CREATE AGGREGATE name (SFUNC = ..., STYPE = ...)` |
| **CREATE OPERATOR** | `CREATE OPERATOR + (LEFTARG = ..., PROCEDURE = ...)` |
| **XMLELEMENT / XMLFOREST / XMLTABLE / XMLAGG** | XML construction and query functions |
| **SQL/JSON functions** | `JSON_TABLE`, `JSON_QUERY`, `JSON_EXISTS`, `JSON_VALUE` (PostgreSQL 16+) |
| **CREATE COLLATION** | `CREATE COLLATION name (LOCALE = ...)` |
| **ALTER ENUM** | `ALTER TYPE myenum ADD VALUE 'new_label'` |
| **Security labels** | `SECURITY LABEL FOR provider ON object IS label` |
| **PL/pgSQL** | Full procedural language (IF/ELSIF, LOOP, RETURN, EXCEPTION, DECLARE) — out of scope for a SQL formatter |

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| .NET Runtime | 8.0 or later |
| Prettier | 3.x |

---

## Installation

```sh
npm install --save-dev prettier prettier-plugin-pgsql
```

Then add the plugin to your Prettier configuration:

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-pgsql'],
  overrides: [
    {
      files: ['*.sql', '*.pgsql'],
      options: {
        parser: 'pgsql',
      },
    },
  ],
};
```

See [Getting Started](docs/getting-started.md) for VS Code setup and build-from-source instructions.

---

## Quick Example

**Input** (unformatted):
```sql
SELECT id,title,price,author_id FROM books WHERE in_stock=TRUE AND price<50 ORDER BY price ASC;
```

**Output** (default options — lowercase keywords, standard density, trailing commas):
```sql
select
  id,
  title,
  price,
  author_id
from
  books
where
  in_stock = true
  and price < 50
order by
  price asc;
```

---

## Configuration

Three formatting options are available. See [Options](docs/options.md) for full details and examples.

| Option | Values | Default | Description |
|---|---|---|---|
| `sqlKeywordCase` | `lower` \| `upper` \| `preserve` | `lower` | Case for SQL keywords |
| `sqlDensity` | `compact` \| `standard` \| `spacious` | `standard` | Whitespace density |
| `sqlCommaStyle` | `trailing` \| `leading` | `trailing` | Comma placement in lists |

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-pgsql'],
  overrides: [
    {
      files: '*.sql',
      options: {
        parser: 'pgsql',
        sqlKeywordCase: 'upper',
        sqlDensity: 'standard',
        sqlCommaStyle: 'trailing',
      },
    },
  ],
};
```

---

## Documentation

- [Getting Started](docs/getting-started.md) — installation, VS Code setup, building from source
- [Options](docs/options.md) — all formatting options with examples
- [Examples](docs/examples.md) — before/after formatting examples for common patterns
- [Formatting Reference](docs/formatting.md) — comprehensive formatting rules by statement type
