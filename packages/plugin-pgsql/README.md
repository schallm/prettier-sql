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

- **CREATE TABLE** — column definitions with full constraint support: NOT NULL, DEFAULT, PRIMARY KEY, FOREIGN KEY (column-level and table-level, with ON UPDATE/DELETE actions), CHECK, UNIQUE, GENERATED ALWAYS AS (stored), GENERATED AS IDENTITY, named constraints, DEFERRABLE; type modifiers (`VARCHAR(100)`, `NUMERIC(10,2)`), array types (`TEXT[]`)
- **ALTER TABLE** — ADD COLUMN, DROP COLUMN, ADD CONSTRAINT, RENAME COLUMN, ALTER COLUMN TYPE, SET/DROP DEFAULT, SET/DROP NOT NULL, RENAME TABLE
- **CREATE VIEW** / **CREATE MATERIALIZED VIEW**
- **CREATE TABLE AS** — `CREATE TABLE foo AS SELECT ...`
- **CREATE INDEX** / CREATE UNIQUE INDEX
- **CREATE FUNCTION** — RETURNS, LANGUAGE, dollar-quoted `$$...$$` body, parameter lists with modes (IN, OUT, INOUT)
- **CREATE TYPE** — composite (`AS (...)`) and enum (`AS ENUM (...)`)
- **ALTER TYPE** — ADD VALUE for enums (with BEFORE/AFTER placement, IF NOT EXISTS)
- **CREATE / ALTER SEQUENCE** — START WITH, INCREMENT BY, MINVALUE, MAXVALUE, CACHE, CYCLE, RESTART WITH
- **CREATE SCHEMA** — with IF NOT EXISTS and AUTHORIZATION
- **CREATE EXTENSION** — with IF NOT EXISTS
- **CREATE TRIGGER** — BEFORE/AFTER/INSTEAD OF, INSERT/UPDATE/DELETE/TRUNCATE, FOR EACH ROW/STATEMENT
- **DROP** — TABLE, VIEW, INDEX, FUNCTION
- **GRANT / REVOKE** — on TABLE, SCHEMA, FUNCTION, and ALL ... IN SCHEMA; WITH GRANT OPTION; CASCADE
- **CREATE / ALTER ROLE** — with LOGIN, PASSWORD, SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION, BYPASSRLS, CONNECTION LIMIT
- **COMMENT ON** — TABLE, COLUMN, SCHEMA, DATABASE, INDEX, SEQUENCE, VIEW, FUNCTION, TYPE
- **CREATE TABLE LIKE** — `CREATE TABLE new (LIKE existing INCLUDING ALL)`
- **Table partitioning** — `PARTITION BY RANGE/LIST/HASH`, `CREATE TABLE ... PARTITION OF`, partition bounds (`FOR VALUES FROM/TO`, `IN`, `WITH`, `DEFAULT`)
- **TABLESAMPLE** — `FROM t TABLESAMPLE BERNOULLI(10)` / `SYSTEM(5) REPEATABLE (42)`
- **VACUUM / ANALYZE / CLUSTER / REINDEX** — maintenance statements with options
- **Foreign data wrappers** — `CREATE SERVER`, `CREATE FOREIGN TABLE`, `CREATE USER MAPPING`, `IMPORT FOREIGN SCHEMA`
- **Logical replication** — `CREATE / ALTER / DROP PUBLICATION` and `SUBSCRIPTION`
- **CREATE AGGREGATE** — `CREATE AGGREGATE name (SFUNC = ..., STYPE = ...)`
- **CREATE OPERATOR** — `CREATE OPERATOR op (LEFTARG = ..., PROCEDURE = ...)`
- **CREATE COLLATION** — `CREATE COLLATION name (LOCALE = ...)` and `FROM existing`
- **SECURITY LABEL** — `SECURITY LABEL FOR provider ON object IS label`

### Expressions

- **SQL standard functions** — `SUBSTRING(str FROM pattern)`, `EXTRACT(field FROM expr)`, `TRIM(LEADING/TRAILING/BOTH ... FROM str)`, `POSITION(x IN y)`, `expr AT TIME ZONE tz`, `OVERLAY(...)`
- **Type casting** — `expr::type` (PostgreSQL style), `INTERVAL '1 day'` literals with optional field modifiers (`HOUR TO MINUTE`, `DAY TO SECOND`, etc.)
- **Array subscripts** — `arr[1]`, `arr[2:4]`, `arr[:3]`
- **Named arguments** — `func(param => value)`
- **Conditional** — CASE / WHEN / THEN / ELSE, COALESCE, NULLIF, GREATEST, LEAST
- **Predicates** — IN / NOT IN, BETWEEN / NOT BETWEEN, LIKE / NOT LIKE, ILIKE / NOT ILIKE, SIMILAR TO, IS NULL / IS NOT NULL, IS DISTINCT FROM, ANY / ALL
- **SQL value functions** — CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_USER, SESSION_USER, LOCALTIME, LOCALTIMESTAMP, and others
- **GROUPING()** — `GROUPING(col)` predicate used alongside GROUPING SETS

### DML (continued)

- **SET / SHOW / RESET** — `SET search_path = myschema`, `SHOW work_mem`, `RESET ALL`
- **SELECT INTO** — `SELECT ... INTO [TEMP] table`
- **COPY** — `COPY table FROM/TO`, `COPY (query) TO`; program and option list
- **EXPLAIN** — `EXPLAIN`, `EXPLAIN ANALYZE`, `EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON) stmt`
- **PREPARE / EXECUTE / DEALLOCATE** — server-side prepared statements
- **LISTEN / UNLISTEN / NOTIFY** — async pub/sub with optional payload
- **LOCK TABLE** — `LOCK TABLE t IN ACCESS EXCLUSIVE MODE [NOWAIT]`
- **Cursors** — `DECLARE CURSOR`, `FETCH`, `MOVE`, `CLOSE`
- **Comment preservation** — line comments (`-- ...`) and block comments (`/* ... */`) are preserved: leading comments before a statement stay before it; inline trailing comments stay on the statement's final line

### DDL (continued)

- **ALTER FUNCTION** — SET COST, SET ROWS, SET VOLATILE/STABLE/IMMUTABLE, RENAME TO, OWNER TO, SET SCHEMA
- **REFRESH MATERIALIZED VIEW** — with CONCURRENTLY
- **CREATE RULE** — BEFORE/AFTER/INSTEAD, INSERT/UPDATE/DELETE/SELECT, DO ALSO/INSTEAD
- **Row Security Policies** — `CREATE / ALTER POLICY` with USING and WITH CHECK

### Pending Implementation

| Feature | Notes |
|---|---|
| **XMLELEMENT / XMLFOREST / XMLTABLE / XMLAGG** | XML construction and query functions |
| **SQL/JSON functions** | `JSON_TABLE`, `JSON_QUERY`, `JSON_EXISTS`, `JSON_VALUE` (PostgreSQL 16+) |
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
