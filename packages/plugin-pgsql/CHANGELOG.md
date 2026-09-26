# prettier-plugin-postgresql

## 0.3.0

### Minor Changes

- b10a4ef: PostgreSQL: more clauses that were silently dropped are now kept.

    - Queries: `ORDER BY … NULLS FIRST/LAST` and `USING <`, `GROUP BY DISTINCT`,
      `LIKE` / `SIMILAR TO … ESCAPE`, `WITHIN GROUP (ORDER BY …)`, window
      `EXCLUDE …` and base windows (`w2 AS (w …)`), `NATURAL LEFT/FULL JOIN`
      (printed as an inner join), `JOIN … USING (…) AS j`, aliases on
      parenthesized joins, and the parentheses around nested joins.
    - Views: `OR REPLACE`, `TEMPORARY`, column lists, `WITH (…)` and
      `WITH CHECK OPTION`.
    - Indexes: `NULLS FIRST/LAST`, operator classes, `COLLATE`, `NULLS NOT DISTINCT`,
      `WITH (…)`, `TABLESPACE`, `ON ONLY`, and parentheses around expression columns.
    - Column `COLLATE`; sequence `AS`, `OWNED BY`, `TEMPORARY` and 64-bit bounds;
      `DROP INDEX CONCURRENTLY`; CTE `[NOT] MATERIALIZED`.
    - `EXPLAIN (analyze, …)` no longer crashes, and `COPY … csv header` no longer
      prints `header ''`.

- 75e4e70: T-SQL: formatting no longer changes what SQL does.

    - Bracketed reserved words keep their brackets (`[order]`, `ON [primary]`), and
      bracketed index, constraint, cursor, window and other names are preserved.
    - CLR and xml methods (`h.GetAncestor()`, `x.value()`) and user functions keep
      their casing; only built-in functions follow `sqlKeywordCase`.
    - `$action` and other pseudo-columns, `GROUP BY ALL`, `WITH ROLLUP`,
      `INSERT TOP (n)`, and `EXEC … WITH RECOMPILE` are kept.
    - `SET NOCOUNT, XACT_ABORT ON` no longer prints `XACTABORT`.
    - `ALTER TABLE … DROP CONSTRAINT x, COLUMN y` keeps each keyword, so `y` is no
      longer dropped as a constraint.
    - `OUTPUT` is placed before `FROM` in `UPDATE` and multi-table `DELETE`;
      `SET @v = col = expr` and `SET col.WRITE(…)` print valid SQL.
    - `@variables` in hints (`OPTIMIZE FOR (@p = 1)`) keep their case.
    - Compact density no longer deletes comments between WHERE predicates.

    Both plugins can now be loaded in the same process (for example a Prettier config
    listing both); previously whichever parsed second failed.

- 2b0cc80: PostgreSQL: formatting no longer changes what a query means.

    - Parentheses are kept wherever operator precedence needs them. Previously every
      parenthesis was dropped, so `(a + b) * c` became `a + b * c` and
      `(x or y) and z` became `x or y and z`.
    - Double-quoted identifiers keep their quotes. Previously `"My Table"` printed as
      `My Table` (invalid SQL) and `"MixedCase"(1)` as `mixedcase(1)` (a different
      function). Names are now quoted exactly when PostgreSQL requires it.
    - `IS TRUE` / `IS NOT FALSE` / `IS UNKNOWN` no longer print as `is istrue` etc.

    T-SQL: `sqlKeywordCase` no longer recases the inside of double-quoted names.

- 8a001d9: PostgreSQL: more fixes for formatting that changed what SQL does.

    - `CREATE POLICY … AS RESTRICTIVE` and the `TO role, …` list of `CREATE POLICY` /
      `ALTER POLICY` were dropped, turning restrictive policies permissive and
      role-scoped policies into policies for everyone.
    - `ALTER TABLE IF EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `CASCADE` on dropped
      columns and constraints were dropped; `ADD COLUMN IF NOT EXISTS` printed as the
      invalid `ADD COLUMN IF EXISTS`.
    - `ONLY` was dropped from `SELECT`, `UPDATE`, `DELETE`, `ALTER TABLE`, `TRUNCATE`
      and `LOCK`, so statements recursed into inheritance children and partitions.
    - `ALTER VIEW` / `ALTER INDEX` / `ALTER MATERIALIZED VIEW` printed as `ALTER TABLE`,
      and `ALTER TABLE s.t SET SCHEMA x` lost the table name.
    - Unsupported `ALTER TABLE` subcommands (e.g. `OWNER TO`) now fail with a clear
      error instead of printing invalid SQL such as `changeowner`.
    - `SET` values: numbers were dropped (`set statement_timeout = ;`) and quoted
      mixed-case values were lowercased (`search_path` `"MySchema"` → `myschema`).
    - Role passwords were recased by `sqlKeywordCase` and weren't escaped.

    Both plugins: `sqlKeywordCase` never recases the inside of single-quoted literals.

- d9fd592: PostgreSQL: DDL formatting no longer drops clauses that change what a statement does.

    - `CREATE TEMP` / `UNLOGGED TABLE`, `ON COMMIT`, `IF NOT EXISTS`, `INHERITS`,
      `USING`, `WITH (…)` and `TABLESPACE` are kept; `CREATE TABLE … AS` and
      materialized views also keep their column lists and `WITH NO DATA`.
    - `GRANT` / `REVOKE` keep column lists (`INSERT (a)`), `GRANT OPTION FOR` and
      `GRANTED BY`; `CURRENT_USER` and similar grantees no longer print as nothing.
    - `CREATE FUNCTION` keeps `OR REPLACE`, `SETOF`, parameter defaults and every
      attribute (`SECURITY DEFINER`, `STRICT`, volatility, `PARALLEL`, `COST`, `SET`,
      …); `CREATE PROCEDURE` no longer prints as `CREATE FUNCTION`; C functions keep
      their link symbol; bodies containing `$$` get a safe dollar-quote tag.
    - `ALTER FUNCTION … SECURITY DEFINER` no longer prints as `SECURITY INVOKER`.
    - `CREATE TRIGGER` keeps `UPDATE OF` columns, function arguments, `OR REPLACE`,
      constraint-trigger options and `REFERENCING` transition tables.
    - Functions and `VALUES` lists in `FROM` format again, and alias column lists
      (`AS g(n)`, `WITH c(a, b)`) are kept.
    - `DROP`, `ALTER`, `COMMENT ON` and `GRANT` keep function and operator argument
      types.

- 08b14d5: - `sqlKeywordCase: "preserve"` now follows the input: an upper-case file keeps
  upper-case keywords and anything else is lower case. It previously behaved like
  `"upper"`.
    - T-SQL output now ends with a newline, like PostgreSQL output and Prettier's own
      printers.

## 0.2.9

### Patch Changes

- 7d19006: Bump `node-api-dotnet` to 0.9.27 (was 0.9.25).

## 0.2.8

### Patch Changes

- d7d420a: Bump `node-api-dotnet` to 0.9.25 (was 0.9.21).

## 0.2.7

### Patch Changes

- aeb9c93: Fail loudly with a clear error instead of silently dropping SQL when the formatter hits an
  unsupported expression, FROM item, or constant kind (e.g. `COLLATE`, `IS JSON`, bit-string
  literals). Previously these cases either emitted an unhelpful `/* unknown: RawExpr */` marker
  or, for unrecognized constant kinds, vanished from the output entirely with no indication
  anything was wrong. The error message now names the specific unsupported construct and shows
  the surrounding source text.
- cfe27f7: Fix several remaining silent-data-loss fallbacks left over from the earlier
  "fail loudly" fix: `WITH cte AS (...)`, `COPY (...) TO ...`, `PREPARE ... AS ...`, and
  `EXPLAIN ...` all silently dropped their inner query when it was a writable `MERGE` (and
  `EXPLAIN` additionally for `CREATE TABLE AS`/`CREATE MATERIALIZED VIEW`, `DECLARE CURSOR`,
  `REFRESH MATERIALIZED VIEW`, and `EXECUTE`, despite formatters for all of these already
  existing). `DROP CAST`/`DROP OPERATOR CLASS`/`DROP OPERATOR FAMILY` similarly lost their
  object name. All of these now format correctly when a builder exists, or throw a clear
  "Unsupported ..." error instead of silently producing wrong SQL.

## 0.2.6

### Patch Changes

- fixes to COPY WHERE and JSON_OBJECTAGG / JSON_ARRAYAGG

## 0.2.5

### Patch Changes

- Minor layout fixes for compact and standard modes

## 0.2.4

### Patch Changes

- Remove extra line returns for minor statements

## 0.2.3

### Patch Changes

- Minor format changes

## 0.2.2

### Patch Changes

- Fix several compact formatting issues

## 0.2.1

### Patch Changes

- Bundle `@prettier-sql/core` into each plugin's `dist/` at build time so that npm users don't encounter an unresolvable `workspace:*` dependency. Previously, installing `prettier-plugin-tsql@0.6.1` with npm (instead of pnpm) failed because `@prettier-sql/core` is a private workspace package never published to npm. The new `bundle-core.mjs` post-build script copies the compiled core utilities into `dist/_core/` and rewrites all import paths, making each published package fully self-contained.

    Also fixes filtered-index `WHERE` predicate formatting: predicates on `CREATE INDEX … WHERE` now go through the expression printer (spaces around operators, keyword casing) instead of raw source text. Compound predicates indent correctly under `where`.

## 0.2.0

### Minor Changes

- a4b725c: Many issues found and fixed
