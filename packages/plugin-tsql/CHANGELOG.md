# prettier-plugin-tsql

## 0.9.1

### Patch Changes

- 385d3b5: `ALTER TABLE ... ADD` keeps `DEFAULT ... WITH VALUES` (which fills existing rows), `PERIOD FOR SYSTEM_TIME (...)` (it printed `add ;`) and `INDEX` definitions; a masking function containing a quote is escaped.
- 7d4fc53: Bracketed names containing `]` keep it escaped (`[a]]b]`); it was printed unescaped, which doesn't parse.
- d3d3ac0: `COLLATE` is kept after any expression — literals, variables, function calls, `CAST`, `CASE`, subqueries and parenthesized expressions. It was only kept after column names and silently dropped elsewhere, changing how comparisons and sorts behave.
- a84657d: Comments inside a statement are no longer dropped. A comment after the last select item, a table name, a join condition, a column definition, a CTE body or a `UNION` disappeared; every comment is now printed where it was, or at worst right after its statement. Line comments in fill-packed lists (`UPDATE ... SET`, compact lists) also end their line, instead of swallowing the items that followed.
- 918848b: `CREATE SCHEMA` keeps the tables, views and permissions created with it (`CREATE SCHEMA s CREATE TABLE ... GRANT ...`); they were dropped.
- bac1614: `UPDATE` / `DELETE ... WHERE CURRENT OF cursor` kept its `WHERE`: it was dropped, which turned a one-row change into one affecting every row.
- 7e2a4b4: `OPEN`, `FETCH`, `CLOSE` and `DEALLOCATE GLOBAL cursor` keep `GLOBAL` — without it a local cursor of the same name is used — and `DECLARE c INSENSITIVE SCROLL CURSOR` keeps its ISO form instead of becoming invalid.
- 55014c6: Kept clauses that were dropped from DML: `OPTION (...)` query hints on `INSERT`, `UPDATE`, `DELETE` and `MERGE`; column names on a derived table (`(SELECT ...) AS s (a, b)`); and `MERGE ... INSERT DEFAULT VALUES`, which printed as `insert values ()`.
- b365ff1: A double negation such as `- -a` printed as `--a`, which starts a comment and drops the rest of the line; it now prints `- -a`.
- 77efa73: `DROP INDEX` keeps its `WITH (ONLINE = ON, MOVE TO ...)` options, and the old `DROP INDEX table.index` form is supported (it printed `drop index ;`).
- 5b8d23b: `EXECUTE` keeps everything it was written with: `AS USER` / `AS LOGIN = 'name'`, pass-through parameters for `EXECUTE ('...', 1) AT server`, a bracketed linked-server name, a procedure number (`dbo.p;2`), and `WITH RESULT SETS` — which was found by searching the text, so a string containing those words produced broken output.
- 95e1522: Function parameters keep their defaults (`@a int = 1`) and `READONLY`; they were dropped.
- a64084f: Indexes declared in a table body are kept: column-level `INDEX ix` in `CREATE TABLE`, and `INDEX` definitions in table variables and table types, along with a table type's `WITH (MEMORY_OPTIMIZED = ON)`. All were dropped.
- a8d12f0: `WITH INLINE = OFF` on a function stays `OFF`; it printed as `INLINE`, which turns scalar UDF inlining on.
- 0729aa3: `SET @x.modify(...)` keeps the method name's case with `sqlKeywordCase: "upper"`: xml and CLR type methods are case-sensitive, so `@x.MODIFY(...)` failed to run.
- 6ec04eb: Triggers keep their `WITH` options (`EXECUTE AS`, `ENCRYPTION`, ...), procedures keep `FOR REPLICATION`, and an `EXECUTE AS 'principal'` containing a quote is escaped.
- b2057bd: A trailing comment on a statement inside `IF`, `WHILE` or another block is printed once; it was repeated after the block.
- 5b4f720: ODBC function escapes such as `{fn UCASE('a')}` keep their `{fn ...}` wrapper; without it the functions don't exist.
- 90e0963: `ALTER TABLE ... REBUILD` without a partition no longer prints an empty `PARTITION =`, and partition numbers given as variables (`REBUILD PARTITION = @p`, `SWITCH PARTITION @p`) are kept.
- 5546526: A comment at the end of a statement inside a block stays on that statement's line. A comment after the last statement of a `TRY` block moved to the top of the `CATCH` block.
- 08d5f5a: `SELECT ... INTO t ON filegroup` keeps its `ON filegroup`.
- 9dd2b7e: Storage clauses are kept on indexes and constraints: `ON scheme(column)` keeps its partitioning column, and `ON filegroup` / `FILESTREAM_ON` are no longer dropped from constraints, inline indexes, `CREATE INDEX` and columnstore indexes. Column-level `PRIMARY KEY` / `UNIQUE` also keep their `WITH (...)` options.
- 9ebdf20: Transaction statements keep everything they were written with: names and savepoints given as variables (`ROLLBACK TRAN @savepoint` had become a full `ROLLBACK`), `COMMIT ... WITH (DELAYED_DURABILITY = ON)`, and `WITH MARK` descriptions that are variables or contain quotes.
- 4b4f71c: A view whose body starts with `WITH` keeps its CTEs (and `XMLNAMESPACES`); they were dropped, leaving a view that referenced a missing name. View column names that need brackets keep them.
- 0924b2d: `WAITFOR (RECEIVE ...), TIMEOUT n` and `WAITFOR (GET CONVERSATION GROUP ...)` are kept; they printed as `waitfor delay ;`.
- 1093422: A `WINDOW` clause is printed before `ORDER BY`, where T-SQL requires it; after it, the output didn't parse.

## 0.9.0

### Minor Changes

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

- 08b14d5: - `sqlKeywordCase: "preserve"` now follows the input: an upper-case file keeps
  upper-case keywords and anything else is lower case. It previously behaved like
  `"upper"`.
    - T-SQL output now ends with a newline, like PostgreSQL output and Prettier's own
      printers.

## 0.8.1

### Patch Changes

- 7d19006: Bump `node-api-dotnet` to 0.9.27 (was 0.9.25).

## 0.8.0

### Minor Changes

- 6063535: Add support for `CREATE/ALTER/DROP EXTERNAL MODEL` (SQL Server 2025's AI functions
  feature for registering external AI models like Azure OpenAI embeddings endpoints) —
  previously entirely unhandled (raw-text passthrough), now parsed and reformatted
  structurally.

### Patch Changes

- d7d420a: Bump `node-api-dotnet` to 0.9.25 (was 0.9.21).
- ebc0d35: Bump `Microsoft.SqlServer.TransactSql.ScriptDom` to 180.78.1 (was 180.37.3). Purely
  additive on the API surface used by this plugin — no behavior change, all fixtures pass
  unchanged.

## 0.7.0

### Minor Changes

- ac253f1: Add Always Encrypted support: `CREATE/DROP COLUMN MASTER KEY`, `CREATE/ALTER/DROP COLUMN
ENCRYPTION KEY`, and the column-level `ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ...,
ENCRYPTION_TYPE = ..., ALGORITHM = ...)` clause are now parsed and reformatted structurally
  instead of being preserved as raw passthrough text.

## 0.6.7

### Patch Changes

- Update to version 180.37.3 of Microsoft.SqlServer.TransactSql.ScriptDom

## 0.6.6

### Patch Changes

- Minor layout fixes for compact and standard modes

## 0.6.5

### Patch Changes

- Remove extra line returns for minor statements

## 0.6.4

### Patch Changes

- Minor format changes

## 0.6.3

### Patch Changes

- Fix several compact formatting issues

## 0.6.2

### Patch Changes

- Bundle `@prettier-sql/core` into each plugin's `dist/` at build time so that npm users don't encounter an unresolvable `workspace:*` dependency. Previously, installing `prettier-plugin-tsql@0.6.1` with npm (instead of pnpm) failed because `@prettier-sql/core` is a private workspace package never published to npm. The new `bundle-core.mjs` post-build script copies the compiled core utilities into `dist/_core/` and rewrites all import paths, making each published package fully self-contained.

    Also fixes filtered-index `WHERE` predicate formatting: predicates on `CREATE INDEX … WHERE` now go through the expression printer (spaces around operators, keyword casing) instead of raw source text. Compound predicates indent correctly under `where`.

## 0.6.1

### Patch Changes

- Fix several data-loss bugs where input SQL was silently dropped or corrupted:
    - `MERGE TOP (N)`: the TOP clause was dropped from MERGE statements
    - Standalone `BEGIN...END` blocks: delimiters were stripped, leaving only the inner statements
    - `LEDGER = ON/OFF`: table option was corrupted to bare `ledger` (invalid SQL)
    - `BEGIN DISTRIBUTED TRANSACTION`: normalized to non-distributed form
    - `BEGIN TRANSACTION ... WITH MARK`: the MARK clause was dropped
    - XML method calls (`SET @xml.modify(...)`): statement was not printed
    - Compound assignment operators (`+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`): all collapsed to `=`
    - CLR `EXTERNAL NAME` on procedures and functions: dropped entirely
    - `ALTER EVENT SESSION ... STATE = START/STOP`: mangled by ScriptDOM fragment length bug

## 0.6.0

### Minor Changes

- a4b725c: Many issues found and fixed

## 0.5.1

### Patch Changes

- 5582509: Update repository link to monorepo
