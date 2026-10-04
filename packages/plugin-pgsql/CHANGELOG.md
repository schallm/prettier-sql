# prettier-plugin-postgresql

## 0.4.0

### Minor Changes

- 9fa3df9: Put a space before an alias's or CTE's column list, `AS s (a, b)` and `cte (a, b) AS (...)`, as before any other column list (PostgreSQL, and T-SQL's `(VALUES ...)`), and before a `TABLESAMPLE` method's argument, `TABLESAMPLE SYSTEM (5)` (PostgreSQL). A `(VALUES ...)` derived table lays out its rows as a standalone `VALUES` does (T-SQL).
- af277fd: End the header of a statement defined by a query with its `AS` or `FOR`, and start the query on the next line: `CREATE VIEW v AS`, `CREATE TABLE t AS`, `DECLARE c CURSOR FOR` and T-SQL's `SET @c = CURSOR FOR`. `AS` / `FOR` used to go on a line of its own in T-SQL, and before `CREATE VIEW`'s query in PostgreSQL. In T-SQL, comments between a view's header and its `AS` now go after the `AS`, above the query.
- 7ad7385: Lay out `CASE` as the T-SQL plugin does: a `CASE` that is the only column starts on its own line under `SELECT`, a nested `CASE` after `THEN` / `ELSE` starts on an indented line, a searched `WHEN` with an `AND` / `OR` condition puts the condition on indented lines of its own, and a call whose only argument spans lines (`sum(case ... end)`) puts that argument on its own lines inside the parentheses.
- b1fbadc: Lay out `GRANT` / `REVOKE` the same way in both dialects: `ON …` goes on a line of its own like `TO` / `FROM` (T-SQL), and a long privilege list packs onto indented lines below the verb (PostgreSQL).
- 7993a73: Print the same keywords for the same SQL in both dialects: an inner join prints as `INNER JOIN` in PostgreSQL (as in T-SQL), and T-SQL no longer adds `ASC` to an `ORDER BY` item or index column that didn't have one (as in PostgreSQL). An `ASC` written in the source is kept.
- 09df34c: Lay out `MERGE` the same way in both dialects: `ON` starts a line of its own after `USING` (PostgreSQL), `UPDATE SET` lays out its assignments as `UPDATE ... SET` does — a single one on the `SET` line, several packed (T-SQL, for one) — and in compact density the action stays on the `THEN` line (T-SQL).
- 901b4e6: Lay out `AND` / `OR` the same way in both dialects. Parenthesized predicates — `(a OR b)`, `NOT (a AND b)` — stay on one line when they fit. A `JOIN ... ON` chain follows `ON`, with further predicates on indented lines (T-SQL), and a single long `ON` predicate moves whole to an indented line (PostgreSQL). In T-SQL, compact density keeps a `WHERE` that fits on the `WHERE` line, and an `AND` inside an `OR` stays on its predicate's line instead of getting a line of its own.
- 7a9b954: Lay out query clauses the same way in both dialects:

    - A window specification stays on one line when it fits, e.g. `over (partition by a order by b)`, and its `ORDER BY` items pack like its `PARTITION BY` items (T-SQL).
    - A single `WINDOW` definition and a `SELECT ... INTO` target stay on the keyword's line (PostgreSQL).
    - In spacious density a single `FROM` table goes on its own line, like every other clause (PostgreSQL).
    - In compact density joins stay on the `FROM` line when they fit (PostgreSQL), and a single select column no longer indents what follows it (T-SQL).
    - `UPDATE ... FROM` a single table stays on the `FROM` line (T-SQL).

- 478b55e: Indent the options of `CREATE SEQUENCE` / `ALTER SEQUENCE` under the statement's first line, as the T-SQL plugin does.
- f81ccb0: Put a blank line above and below `UNION`, `INTERSECT` and `EXCEPT`, as the T-SQL plugin does.
- c915478: In compact density a subquery after `IN`, a comparison or `ANY` / `ALL` stays on one line when it fits (PostgreSQL), and a `CROSS JOIN` / `APPLY` stays on the `FROM` line when it fits (T-SQL). `NOT x IN (subquery)` prints as `x NOT IN (subquery)` (PostgreSQL), and a comparison under `NOT` gets parentheses — `NOT (a = 1)` — in both.

### Patch Changes

- c88625e: When even `x BETWEEN low` doesn't fit within `printWidth`, put the two bounds of a `BETWEEN` on indented lines of their own, the second starting with `AND`. A predicate where only the `AND` bound doesn't fit still breaks before it.
- 772b0d4: When one argument of a call or `IN` list spans lines (a `CASE` or a subquery) and there is more than one argument, put every argument on its own line instead of leaving the others to run past `printWidth` next to the closing parenthesis. A call with a single such argument, like `SUM(CASE ... END)`, is unchanged.
- d3dfc65: Indent a term of a wrapped `+` / `-` / `||` chain as a block, so a call or `CASE` that breaks inside it lines its closing parenthesis up under the term's operator instead of two columns to the left of it.
- fb46c11: Count a select item's `AS alias` when wrapping a `+` / `-` / `||` chain, so the line holding the last term and the alias no longer runs past `printWidth`.
- e93fdbd: Count the comma after the last item on a line when packing a list several items to a line. A packed line (a long `IN` list, the names of a `DROP` or `TRUNCATE`, compact density) could end one column past `printWidth` because the comma wasn't counted.
- a9d638e: Count the closing `;` when filling the names of a `DROP` or `TRUNCATE` several to a line, so the last line can no longer end one column past `printWidth`.
- 93c3924: In compact density, the query after a `WITH` and a `SELECT ... INTO` collapse to one line when they fit (PostgreSQL), and in spacious density a `WITHIN GROUP (ORDER BY ...)` or `JSON_ARRAYAGG(... ORDER BY ...)` stays inside its parentheses on one line (T-SQL).
- 083d2e4: Put the subquery of an `EXISTS` on its own lines, formatted like any other `SELECT`, in standard and spacious density (`compact` keeps a short one inline). In T-SQL, `IF EXISTS (...)` and `WHILE EXISTS (...)` no longer indent the subquery an extra level.
- 67a44e6: With `sqlCommaStyle: "leading"`, a packed list that fits on one line (`UPDATE ... SET a = 1, b = 2`, multi-row `VALUES`) no longer prints a space before each comma.
- 1041068: Put the `AND` bound of a `BETWEEN` predicate on an indented line of its own when the predicate doesn't fit within `printWidth`.
- 7017021: Break the arguments of a function call that doesn't fit within `printWidth` onto their own lines, one per line, with the closing parenthesis on its own line. PostgreSQL's `COALESCE` and `ROWS FROM (...)` and T-SQL's `COALESCE`, `IIF`, `NULLIF`, `CONVERT` and `TRY_CONVERT` stayed on one line however long they were; they now break like other calls.
- d9db9f5: Put the `THEN` part of a `CASE` arm, or the result of an `ELSE`, on an indented line of its own when the arm doesn't fit within `printWidth`. An arm with a comment or a nested `CASE` is unchanged.
- 3e6f70d: Wrap a column definition that doesn't fit within `printWidth`: the name, type and collation stay together and each constraint or clause (`NOT NULL`, `DEFAULT`, `CONSTRAINT ... PRIMARY KEY`, `REFERENCES ... ON DELETE`, `CHECK`, `IDENTITY`, `ENCRYPTED WITH`) goes on its own indented line. A column that fits stays on one line.
- 3ba84ff: Move the right-hand side of a comparison, `LIKE`, `IS DISTINCT FROM` or other binary operator onto an indented line after the operator when it doesn't fit within `printWidth`, if neither side can break on its own. A call, subquery, `CASE` or wrapped chain next to the operator is unchanged.
- 6efb85d: Wrap a long `IN (...)` list or `ARRAY[...]` that doesn't fit within `printWidth`. A list of literals packs as many to a line as fit, between parentheses on their own lines; a list of other expressions puts one per line. PostgreSQL's `IN` list and `ARRAY[...]` never wrapped; T-SQL's `IN` list now packs literals instead of one per line.
- 92ecaf2: Break a parenthesized option list that doesn't fit within `printWidth` — `WITH (...)`, `OPTIONS (...)`, `SET (...)`, `ENCRYPTED WITH (...)`, `COPY ... (...)`, `EXPLAIN (...)`, `VACUUM (...)`, `RESULT SETS (...)`, `OPTION (...)` and the like — with one option per line between parentheses. A list that fits stays on one line.
- 57cb5c2: Lay out a `MERGE ... INSERT` the same way in both dialects: `VALUES` goes on its own line after a column list (on the `INSERT` line in compact density, when it fits), a long column list breaks like any other, and without a column list `INSERT VALUES (...)` / `INSERT DEFAULT VALUES` stays on one line.
- 5e5e077: Wrap a long chain that mixes `+` and `-` like a chain of one operator: terms fill each line, continuation lines are indented and start with their operator. `a + b * c - d` stopped wrapping after the first `+`, leaving a long second line.
- 971139b: Wrap a `WITH (...)` / `OPTIONS (...)` list that holds a single option too long for the line (`SWITCH PARTITION ... WITH (WAIT_AT_LOW_PRIORITY (...))`), and indent the options of a `PRIMARY KEY` / `UNIQUE` constraint's `WITH (...)` under the constraint instead of at its own indentation.
- d321afa: Keep `IF EXISTS` in `ALTER SEQUENCE IF EXISTS`.
- 3e64e7a: Keep `IF NOT EXISTS` in `CREATE COLLATION`.
- 090637f: Format `CREATE DOMAIN`: on one line when it fits, otherwise `COLLATE`, `DEFAULT`, `NOT NULL` and each `CHECK` constraint on an indented line of their own, with a long `CHECK` condition wrapping like a table constraint. It used to be kept exactly as written.
- 4b756d5: Keep `IF NOT EXISTS`, `TYPE` and `VERSION` in `CREATE SERVER`, and `IF NOT EXISTS` in `CREATE USER MAPPING`.
- ba43d47: Keep `TO value DEFAULT value` in a recursive CTE's `CYCLE ... SET mark` clause. It was dropped, which changed the mark to `TRUE` / `FALSE`.
- 2bb23f8: Keep the database name of a three-part name (`mydb.public.t`), which was dropped.
- 0054dcd: Format `CREATE EVENT TRIGGER`: the name, `ON event`, the `WHEN tag IN (...)` filters and `EXECUTE FUNCTION f()` each on their own line, like `CREATE TRIGGER`. It used to be kept exactly as written. `EXECUTE PROCEDURE` is printed as `EXECUTE FUNCTION`, which PostgreSQL parses to the same statement.
- d9e02ff: Wrap an aggregate call with `ORDER BY` inside its parentheses and a `FILTER (WHERE ...)` clause that don't fit within `printWidth`. The `ORDER BY` goes on its own line after the arguments, and the filter condition breaks inside its parentheses. A call with one argument and an `ORDER BY` used to stay on one line however long it was, and the filter's own comparison split instead.
- 9d0b5fe: Break a long alias column list (`AS x(a, b, c)`), column definition list (`AS x(a integer, b text)`) and `JOIN ... USING (...)` list one per line when it doesn't fit within `printWidth`. A long alias after a function call no longer pushes the call's own arguments onto separate lines.
- 4b042af: Break a long column list one column per line when it doesn't fit within `printWidth`: the columns and `INCLUDE` list of `CREATE INDEX`, the columns of `CREATE VIEW` and `CREATE TABLE AS`, the column list of `COPY`, and the key columns of `PRIMARY KEY`, `UNIQUE` and `FOREIGN KEY ... REFERENCES` constraints.
- 810b1f8: Move the text of a `COMMENT ON ... IS '...'` to an indented line of its own when it doesn't fit after `IS` within `printWidth`.
- e285089: Wrap a `FOREIGN KEY` or `CHECK` constraint that doesn't fit within `printWidth`: the constraint name stays on the first line and `FOREIGN KEY (...)`, `REFERENCES ...`, `ON UPDATE`, `ON DELETE`, the `DEFERRABLE` / `NOT VALID` / `NO INHERIT` attributes and `CHECK (...)` each go on an indented line of their own. A constraint that fits stays on one line.
- 0c4a354: Wrap a `CREATE INDEX` that doesn't fit within `printWidth`: `ON table USING method (...)` moves to an indented line when it can't follow the index name, and `INCLUDE`, `NULLS NOT DISTINCT`, `WITH`, `TABLESPACE` and `WHERE` each go on an indented line of their own when they don't all fit after the column list. A statement that fits stays on one line.
- 8a628bd: Wrap a long `DROP` or `TRUNCATE`: the names fill an indented line, and `ON`, `USING`, `RESTART IDENTITY` and `CASCADE` each go on a line of their own, when the statement doesn't fit within `printWidth`. One that fits stays on one line.
- 516ec9c: Break the parameter list of `CREATE FUNCTION` / `CREATE PROCEDURE`, and the column list of `RETURNS TABLE (...)`, one per line when it doesn't fit within `printWidth`.
- d83dba0: Wrap the first line of a long `GRANT` / `REVOKE`: when `GRANT privileges ON object` doesn't fit within `printWidth`, the privileges go on an indented line of their own, filling it, and `ON ...` starts the next line.
- 7436fa9: Put the options of `GENERATED ... AS IDENTITY (...)` (`START WITH`, `INCREMENT BY`, `MINVALUE`, ...) one per line between the parentheses when they don't fit within `printWidth`. They are separated by spaces, so no commas are added.
- e0dbd02: Break a `JSON_QUERY` / `JSON_VALUE` call that doesn't fit within `printWidth`: the context and path stay together on the first line and `PASSING`, `RETURNING`, the wrapper and quotes options, and the `ON EMPTY` / `ON ERROR` behaviors each go on their own line.
- 26287c7: Wrap a long `ALTER ... RENAME ... TO ...`: the `RENAME` clause goes on an indented line below the object, and its `TO` on one more when even that doesn't fit within `printWidth`. A rename that fits stays on one line.
- 108961b: Put the options of `CREATE ROLE` / `CREATE USER` / `ALTER ROLE` one per line, indented under the name, when they don't fit on one line within `printWidth`. Options that fit stay on one line below the name, as before.
- a2b5b58: Put the value of a `SET name = ...` on an indented line of its own, filling it, when the value list (such as `search_path`) or string doesn't fit after the `=` within `printWidth`.
- a967f6e: Wrap a column or expression list that doesn't fit within `printWidth` even when it holds a single item: the columns of `CREATE INDEX` and `INCLUDE`, `PARTITION BY (...)`, `SELECT DISTINCT ON (...)` and the bounds of `FOR VALUES FROM (...) TO (...)` / `FOR VALUES IN (...)`. `PARTITION BY`, `DISTINCT ON` and the partition bounds never wrapped before.
- ae56a84: Break a window specification that doesn't fit within `printWidth` — `OVER (...)` and the `WINDOW` clause — with `PARTITION BY`, `ORDER BY` and the frame each on their own line. One that fits stays on one line.
- bd933d0: Keep an operator class's parameters on an index column, as in `(body gist_trgm_ops (siglen = 32))`.
- 3952375: Keep `OR REPLACE` in `CREATE OR REPLACE RULE`.
- 9560276: Keep the `WITH (...)` options of `CREATE TABLESPACE`.

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
