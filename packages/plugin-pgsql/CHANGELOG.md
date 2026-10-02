# prettier-plugin-postgresql

## 0.3.3

### Patch Changes

- c91f89f: Keep the `COLLATE` clause of `ALTER COLUMN ... TYPE`, instead of silently dropping it.
- b2820c7: Keep the OID of `ALTER LARGE OBJECT`, the `ADD USER` / `DROP USER` member list of `ALTER GROUP`, and `OWNER TO current_user` (and the other role keywords), instead of printing a statement that means something else.
- 40eb725: Format the remaining `ALTER TABLE` / `ALTER INDEX` / `ALTER VIEW` / `ALTER MATERIALIZED VIEW` / `ALTER FOREIGN TABLE` / `ALTER SEQUENCE` subcommands: `OWNER TO`, `SET TABLESPACE`, `SET (...)` / `RESET (...)`, identity (`ADD GENERATED`, `SET GENERATED`, `RESTART`, `DROP IDENTITY`), `DROP EXPRESSION`, `SET EXPRESSION`, `SET STATISTICS`, `SET STORAGE`, `SET COMPRESSION`, `VALIDATE` / `ALTER CONSTRAINT`, trigger and rule enable/disable, row level security, `CLUSTER ON`, `SET LOGGED` / `UNLOGGED`, `INHERIT`, `OF`, `REPLICA IDENTITY`, `ATTACH` / `DETACH PARTITION`, and foreign table `OPTIONS`. These used to make the formatter fail. A partition bound value it cannot print now fails loudly instead of being dropped.
- 7516b64: Keep the subscripts and field names of INSERT and UPDATE targets (`set a[1] = 2`, `insert into t (a.b)`), the `UNLOGGED` of `SELECT ... INTO UNLOGGED`, and `OVERRIDING ... VALUE` in `MERGE ... INSERT`, instead of silently dropping them.
- b239857: Lay out `AND`/`OR` outside WHERE/HAVING-style clauses on one line when it fits (select lists, `JOIN ... ON`, `CASE`, function arguments, CHECK, policies, triggers), hanging indented otherwise, instead of starting each operand at column 0. Parenthesised `AND`/`OR` groups stay on one line when short.
- 9752bcb: Indent `ELSE` in a `CASE` expression to line up with its `WHEN` branches, as the T-SQL plugin does.
- 8ac17f4: Print the real syntax for `COMMENT ON` constraint, trigger, rule, policy, domain constraint, operator class / family, transform and cast targets, and keep the OID of `COMMENT ON LARGE OBJECT`.
- 1288baf: Keep the objects created inside `CREATE SCHEMA ... CREATE TABLE ... CREATE VIEW ...`, instead of dropping them.
- 12c7fca: Keep the `OF type` and `WITH OPTIONS` of typed tables, the `STORAGE` and `COMPRESSION` column clauses, and `IF NOT EXISTS` on `CREATE FOREIGN TABLE`, instead of silently dropping them.
- 84925e0: Format `DEFAULT` in `VALUES` and `SET`, multi-column assignment (`SET (a, b) = (1, 2)`, `= (SELECT ...)`), `expr COLLATE "C"`, `WHERE CURRENT OF cursor`, `merge_action()` and bit-string literals (`B'101'`, `X'ff'`), which used to make the formatter fail.
- 3dccb55: Format `CREATE FUNCTION ... TRANSFORM FOR TYPE ...` and `CREATE TABLE ... AS EXECUTE ...`, which used to make the formatter fail.
- 0e6f783: Print every GRANT / REVOKE object type correctly: `FOREIGN SERVER`, `TYPE`, `DOMAIN`, `LARGE OBJECT`, `PARAMETER`, `ALL PROCEDURES IN SCHEMA` and the rest, instead of an internal name or a missing object name.
- f90ac46: Print `expr IS DOCUMENT` as a postfix predicate instead of the invalid `is document(expr)`.
- 63316c0: Keep the options, option values and target of `CLUSTER`, `REINDEX`, `VACUUM` and `ANALYZE`: `cluster verbose`, `cluster (verbose) t using i`, `reindex schema s`, `reindex database d`, `reindex system d`, `reindex (tablespace ts)`, and the case of quoted option values.
- c080785: Keep the whole `PARTITION BY` element (`((lower(a)))`, `COLLATE`, operator class), `PARTITION OF` with its columns, storage and `IF NOT EXISTS`/`UNLOGGED`, foreign tables' `PARTITION OF` and `INHERITS` and column `OPTIONS` before constraints, and `CREATE [OR REPLACE] AGGREGATE` arguments (`ORDER BY`, `*`, `VARIADIC`, argument names). `DROP`/`ALTER`/`COMMENT ON AGGREGATE a(*)` keep their `*`.
- 607882c: Keep argument modes and names in function and aggregate signatures of `DROP`, `ALTER`, `COMMENT` and `GRANT` (`DROP FUNCTION f(IN a int, OUT b text)`, `DROP PROCEDURE p(INOUT x int)`, `VARIADIC`), which were reduced to bare input types.
- 0fe7f52: Print `SECURITY LABEL ON` domain, type, function, large object and other targets correctly instead of an internal object-type name.
- 1d8536d: Keep the interval of `SET TIME ZONE INTERVAL '1' HOUR TO MINUTE` instead of turning it into the plain string `'1'`.
- c4b1484: Format SQL-standard function bodies (`CREATE FUNCTION ... RETURN expr`, `BEGIN ATOMIC ... END` for functions and procedures), expressions in partition bounds (`FOR VALUES FROM (date '2020-01-01') TO (...)`, `IN (1 + 1)`) and `GENERATED ... AS IDENTITY (SEQUENCE NAME s)`, which used to make the formatter fail.
- c4b1484: Format the rest of the SQL/JSON syntax, which used to make the formatter fail: `x IS [NOT] JSON [VALUE | ARRAY | OBJECT | SCALAR] [WITH UNIQUE KEYS]`, `JSON_SCALAR`, `JSON_SERIALIZE`, `JSON(...)` and `JSON_ARRAY(SELECT ...)`. `XMLTABLE(XMLNAMESPACES(...), ...)` and the column list of an `XMLTABLE` / `JSON_TABLE` alias (`AS t(a, b)`) were silently dropped and are kept now.
- 15e4822: Print `(a, b) OVERLAPS (c, d)`, `x IS [NOT] [NFC] NORMALIZED`, `NORMALIZE(x, NFC)`, `SYSTEM_USER`, `COLLATION FOR (x)` and `XMLEXISTS(path PASSING doc)` as SQL syntax instead of the `pg_catalog` function call they parse to, which meant something else.
- 1bd3331: Keep `VARIADIC` in function calls (`f(VARIADIC arr)`), operator-valued options (`commutator = ===`, `sortop = <`) and numeric options of `CREATE AGGREGATE` / `OPERATOR` / `TYPE`, `t.a%TYPE` in function signatures, and the comments of a script that has no statements; these were silently dropped. An option value of a kind the formatter cannot print now raises an error instead of vanishing.

## 0.3.2

### Patch Changes

- 7210de2: `ALTER SUBSCRIPTION` no longer deletes the statement (it printed `/* unknown: AlterSubscriptionStatement */`); every form (`CONNECTION`, `SET`/`ADD`/`DROP PUBLICATION`, `REFRESH PUBLICATION`, `ENABLE`/`DISABLE`, `SET (...)`, `SKIP (...)`) now round-trips. `ALTER PUBLICATION`'s object-list and reloption forms, and `DROP SUBSCRIPTION ... CASCADE`, are also now printed correctly instead of being dropped or silently losing `CASCADE`.
- 4a24cd1: `expr AT LOCAL` now prints correctly instead of the unparseable `AT TIME ZONE expr`.
- 60bc1cc: `CLOSE ALL` no longer prints the unparseable `CLOSE ;`.
- c5b810d: `CREATE EXTENSION ... CASCADE` no longer drops the `CASCADE` clause.
- 4b08501: `DECLARE ... ASENSITIVE CURSOR` no longer drops the `ASENSITIVE` keyword.
- 7d4a756: `DECLARE ... CURSOR WITH HOLD` no longer drops `WITH HOLD`; `BINARY` cursors were also silently dropped (the option bit checked didn't match the one PostgreSQL actually sets).
- 10cb1df: A bare reloption/option identifier value (e.g. `WITH (x = "Off")`) is now re-quoted like any other identifier instead of printing bare, which was folding it to lowercase (`off`) on the next parse and changing its value.
- 9f8411b: An FDW option value (`OPTIONS (...)` on a foreign server, table, or column) with an embedded `'` no longer prints unescaped, which didn't parse.
- 9fad1fd: `CREATE FOREIGN TABLE` keeps per-column `OPTIONS (...)`; they were silently dropped.
- e483cb3: `IMPORT FOREIGN SCHEMA` keeps `LIMIT TO (...)`, `EXCEPT (...)`, and `OPTIONS (...)`; all three were silently dropped.
- 68ff776: `CREATE TABLE ... PARTITION OF ... PARTITION BY ...` keeps its trailing `PARTITION BY` clause instead of dropping it.
- af039ea: `CREATE PUBLICATION` keeps its per-table column list, `WHERE` filter, `TABLES IN SCHEMA`/`TABLES IN SCHEMA CURRENT_SCHEMA`, and `WITH (...)` options — all were silently dropped. Fixed a related bug where a `WITH (...)` reloption's quoted string value (e.g. `publish = 'insert'`) printed without quotes, changing its meaning on reparse.
- c2640db: `REFRESH MATERIALIZED VIEW ... WITH NO DATA` keeps the `WITH NO DATA` clause instead of silently dropping it.
- 0445667: `CREATE ROLE`/`ALTER ROLE` keep `VALID UNTIL`, `IN ROLE`, `ROLE`, `ADMIN`, and `SYSID` — they were silently dropped.
- a24d0dd: Keep `SECURITY LABEL ON ...` without a `FOR provider` clause parseable, instead of printing an empty `FOR`.
- c21387d: Several printers built a `'...'` string literal from raw text without doubling an embedded `'`, producing unparseable output: `CREATE EXTENSION ... VERSION`, `COMMIT/ROLLBACK PREPARED`'s transaction id, `COPY ... TO`/`TO PROGRAM`'s filename, `NOTIFY`'s payload, `LOAD`'s filename, `CREATE TABLESPACE ... LOCATION`, and `SECURITY LABEL ... IS`.
- 2a065c3: `CREATE SUBSCRIPTION ... WITH (...)` keeps its options; they were silently dropped.
- b448c12: `LIKE ... INCLUDING ALL EXCLUDING x` in `CREATE TABLE` no longer drops the `EXCLUDING` clauses; the `COMPRESSION` option was also missing from the `INCLUDING`/`EXCLUDING` list.
- 0930927: `INSERT INTO`, `UPDATE`, and `DELETE FROM` keep the target table's `AS alias` — it was silently dropped, breaking any qualified reference to it elsewhere in the statement (e.g. `ON CONFLICT ... DO UPDATE ... WHERE x.a > 0`).
- fc0b8b6: A bare-identifier `WITH (...)` option value (e.g. `fastupdate = off`) no longer drops the value; it applies to every `WITH (...)` clause that shares the option-value builder (`CREATE TABLE`, `CREATE INDEX`, constraints, etc).
- 4082f89: `XMLPARSE`, `XMLROOT`, and `XMLSERIALIZE` now print their SQL keyword forms (`XMLPARSE(DOCUMENT ...)`, `XMLROOT(x, VERSION ..., STANDALONE ...)`, `XMLSERIALIZE(DOCUMENT ... AS type)`) instead of unparseable positional-argument calls; `XMLSERIALIZE` was previously unsupported.
- 25fce60: `XMLPARSE(... PRESERVE WHITESPACE)` no longer drops the `PRESERVE WHITESPACE` option, which changed the expression's meaning.

## 0.3.1

### Patch Changes

- bdd66bc: Fix formatting that changed what SQL means or produced SQL that doesn't parse:

    - `UNION` / `INTERSECT` / `EXCEPT` kept their `WITH`, `ORDER BY`, `LIMIT` and locking clauses, and operands are parenthesized where needed.
    - `ARRAY(subquery)`, `(f(x)).*`, `ROW(...)` and row comparisons with a subquery are preserved.
    - Type names resolve as written (`float8`, `"char"`, `int[3]`, `pg_catalog.text`), and casts to `interval` of non-literals stay casts.
    - Constraints keep every clause: `EXCLUDE`, `MATCH FULL`, `NO INHERIT`, `NOT VALID`, `INCLUDE` / `WITH` / `USING INDEX TABLESPACE`, `ON DELETE SET NULL (cols)`, identity options, table-level `DEFERRABLE`, and `USING INDEX`.
    - `ON CONFLICT` keeps expression targets and the partial-index `WHERE`.
    - `ALTER ... RENAME` works for every object kind, including `ALTER TYPE ... RENAME VALUE`, which had become `ADD VALUE`.
    - `DROP TRIGGER / POLICY / RULE ... ON`, `DROP OPERATOR CLASS ... USING`, `DROP CAST` and `DROP TRANSFORM` are printed correctly.
    - Kept: `COMMIT AND CHAIN`, `ALTER COLUMN ... TYPE ... USING`, `ALTER TYPE ... ADD / DROP / ALTER ATTRIBUTE`, VACUUM / ANALYZE option values, `current_timestamp(0)`-style precision, schema-qualified `OPERATOR(...)`, SQL/JSON `PASSING`, wrapper, quotes and `ON EMPTY` / `ON ERROR` clauses, and JSON aggregate `ORDER BY` / `FILTER` / `OVER`.
    - Quotes in enum values are escaped, and `DO` blocks no longer gain a `LANGUAGE plpgsql`.

- 4750d81: A schema-qualified operator in `ANY` / `ALL` (`a OPERATOR(pg_catalog.=) ANY (...)`) is kept; it printed the schema name as the operator, which doesn't parse.
- c504901: A `VALUES` query keeps its `WITH` clause (`WITH c AS (...) VALUES (...)`); the CTEs were dropped.

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
