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

### DDL

- **CREATE TABLE** — column definitions, type modifiers (`VARCHAR(100)`, `NUMERIC(10,2)`), array types (`TEXT[]`)
- **ALTER TABLE** — ADD COLUMN, DROP COLUMN, ADD CONSTRAINT
- **CREATE VIEW**
- **CREATE INDEX** / CREATE UNIQUE INDEX
- **CREATE FUNCTION** — parameter lists with modes (IN, OUT, INOUT)
- **DROP** — TABLE, VIEW, INDEX, FUNCTION

### Expressions

- **SQL standard functions** — `SUBSTRING(str FROM pattern)`, `EXTRACT(field FROM expr)`, `TRIM(LEADING/TRAILING/BOTH ... FROM str)`, `POSITION(x IN y)`, `expr AT TIME ZONE tz`, `OVERLAY(...)`
- **Type casting** — `expr::type` (PostgreSQL style), `INTERVAL '1 day'` literals
- **Array subscripts** — `arr[1]`, `arr[2:4]`, `arr[:3]`
- **Named arguments** — `func(param => value)`
- **Conditional** — CASE / WHEN / THEN / ELSE, COALESCE, NULLIF, GREATEST, LEAST
- **Predicates** — IN / NOT IN, BETWEEN / NOT BETWEEN, LIKE / NOT LIKE, ILIKE / NOT ILIKE, SIMILAR TO, IS NULL / IS NOT NULL, IS DISTINCT FROM, ANY / ALL
- **SQL value functions** — CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_USER, SESSION_USER, LOCALTIME, LOCALTIMESTAMP, and others

### Pending

- Column constraints in DDL (NOT NULL, DEFAULT, PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE) — column names and types are formatted; constraint keywords are currently dropped
- MERGE statement
- Named window clauses (`WINDOW w AS (...)`)
- SELECT INTO
- Type modifiers for INTERVAL fields (e.g. `INTERVAL HOUR TO MINUTE`)
- Dollar-quoted strings (`$$...$$`)
- PL/pgSQL procedural blocks

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
