# prettier-plugin-tsql

## 0.10.0

### Minor Changes

- 5c5d393: Indent an `ALTER TABLE` action under the `ALTER TABLE t` line, as the PostgreSQL plugin does.
- af277fd: End the header of a statement defined by a query with its `AS` or `FOR`, and start the query on the next line: `CREATE VIEW v AS`, `CREATE TABLE t AS`, `DECLARE c CURSOR FOR` and T-SQL's `SET @c = CURSOR FOR`. `AS` / `FOR` used to go on a line of its own in T-SQL, and before `CREATE VIEW`'s query in PostgreSQL. In T-SQL, comments between a view's header and its `AS` now go after the `AS`, above the query.
- c099894: Lay out constraints as the PostgreSQL plugin does. `NULL` / `NOT NULL` and `DEFAULT` keep the order they were written in. A `FOREIGN KEY` or `CHECK` stays on one line when it fits, otherwise the constraint name goes on its own line with each clause (`FOREIGN KEY (…)`, `REFERENCES …`, `ON UPDATE …`, `ON DELETE …`) on an indented line below it, and a long `CHECK` condition breaks inside its parentheses. A `PRIMARY KEY` / `UNIQUE` stays on the constraint name's line.
- 0f930c2: Lay out `CREATE INDEX` as the PostgreSQL plugin does: `ON table (columns)` stays on the `CREATE INDEX` line when it fits, and `INCLUDE`, `WHERE`, `WITH`, `ON filegroup` and `FILESTREAM_ON` follow on the same line when they all fit, otherwise each on an indented line of its own.
- 96a5f38: Lay out `DROP` as the PostgreSQL plugin does: on one line when it fits, otherwise the names fill an indented line. `DROP INDEX a, b` no longer puts each index on a line of its own, and a long `DROP TABLE a, b, c` now wraps.
- 7993a73: Print the same keywords for the same SQL in both dialects: an inner join prints as `INNER JOIN` in PostgreSQL (as in T-SQL), and T-SQL no longer adds `ASC` to an `ORDER BY` item or index column that didn't have one (as in PostgreSQL). An `ASC` written in the source is kept.
- 09df34c: Lay out `MERGE` the same way in both dialects: `ON` starts a line of its own after `USING` (PostgreSQL), `UPDATE SET` lays out its assignments as `UPDATE ... SET` does — a single one on the `SET` line, several packed (T-SQL, for one) — and in compact density the action stays on the `THEN` line (T-SQL).
- 901b4e6: Lay out `AND` / `OR` the same way in both dialects. Parenthesized predicates — `(a OR b)`, `NOT (a AND b)` — stay on one line when they fit. A `JOIN ... ON` chain follows `ON`, with further predicates on indented lines (T-SQL), and a single long `ON` predicate moves whole to an indented line (PostgreSQL). In T-SQL, compact density keeps a `WHERE` that fits on the `WHERE` line, and an `AND` inside an `OR` stays on its predicate's line instead of getting a line of its own.
- 7a9b954: Lay out query clauses the same way in both dialects:

    - A window specification stays on one line when it fits, e.g. `over (partition by a order by b)`, and its `ORDER BY` items pack like its `PARTITION BY` items (T-SQL).
    - A single `WINDOW` definition and a `SELECT ... INTO` target stay on the keyword's line (PostgreSQL).
    - In spacious density a single `FROM` table goes on its own line, like every other clause (PostgreSQL).
    - In compact density joins stay on the `FROM` line when they fit (PostgreSQL), and a single select column no longer indents what follows it (T-SQL).
    - `UPDATE ... FROM` a single table stays on the `FROM` line (T-SQL).

### Patch Changes

- 9fa3df9: Put a space before an alias's or CTE's column list, `AS s (a, b)` and `cte (a, b) AS (...)`, as before any other column list (PostgreSQL, and T-SQL's `(VALUES ...)`), and before a `TABLESAMPLE` method's argument, `TABLESAMPLE SYSTEM (5)` (PostgreSQL). A `(VALUES ...)` derived table lays out its rows as a standalone `VALUES` does (T-SQL).
- c88625e: When even `x BETWEEN low` doesn't fit within `printWidth`, put the two bounds of a `BETWEEN` on indented lines of their own, the second starting with `AND`. A predicate where only the `AND` bound doesn't fit still breaks before it.
- 772b0d4: When one argument of a call or `IN` list spans lines (a `CASE` or a subquery) and there is more than one argument, put every argument on its own line instead of leaving the others to run past `printWidth` next to the closing parenthesis. A call with a single such argument, like `SUM(CASE ... END)`, is unchanged.
- d3dfc65: Indent a term of a wrapped `+` / `-` / `||` chain as a block, so a call or `CASE` that breaks inside it lines its closing parenthesis up under the term's operator instead of two columns to the left of it.
- fb46c11: Count a select item's `AS alias` when wrapping a `+` / `-` / `||` chain, so the line holding the last term and the alias no longer runs past `printWidth`.
- e93fdbd: Count the comma after the last item on a line when packing a list several items to a line. A packed line (a long `IN` list, the names of a `DROP` or `TRUNCATE`, compact density) could end one column past `printWidth` because the comma wasn't counted.
- 93c3924: In compact density, the query after a `WITH` and a `SELECT ... INTO` collapse to one line when they fit (PostgreSQL), and in spacious density a `WITHIN GROUP (ORDER BY ...)` or `JSON_ARRAYAGG(... ORDER BY ...)` stays inside its parentheses on one line (T-SQL).
- 083d2e4: Put the subquery of an `EXISTS` on its own lines, formatted like any other `SELECT`, in standard and spacious density (`compact` keeps a short one inline). In T-SQL, `IF EXISTS (...)` and `WHILE EXISTS (...)` no longer indent the subquery an extra level.
- b1fbadc: Lay out `GRANT` / `REVOKE` the same way in both dialects: `ON …` goes on a line of its own like `TO` / `FROM` (T-SQL), and a long privilege list packs onto indented lines below the verb (PostgreSQL).
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
- c915478: In compact density a subquery after `IN`, a comparison or `ANY` / `ALL` stays on one line when it fits (PostgreSQL), and a `CROSS JOIN` / `APPLY` stays on the `FROM` line when it fits (T-SQL). `NOT x IN (subquery)` prints as `x NOT IN (subquery)` (PostgreSQL), and a comparison under `NOT` gets parentheses — `NOT (a = 1)` — in both.
- 1644457: Format Azure SQL's `ALTER DATABASE ... MODIFY (EDITION = ..., SERVICE_OBJECTIVE = ...)` and keep its `WITH MANUAL_CUTOVER`. It printed as `ALTER DATABASE ... SET SERVICE_OBJECTIVE = ...`, which does not parse.
- f507895: Format `ALTER INDEX ... FOR (ADD ..., REMOVE ...)` on a selective XML index, with its `WITH XMLNAMESPACES`. It printed as `ALTER INDEX ... UPDATESELECTIVEXMLPATHS`, which does not parse.
- 4d74fc9: Format the `BACKUP`, `RESTORE` and `CREATE DATABASE` forms that were kept as written:

    - `BACKUP` with `FILE` / `FILEGROUP` / `READ_WRITE_FILEGROUPS` lists, `MIRROR TO` clauses and `ENCRYPTION (ALGORITHM = ..., SERVER CERTIFICATE | SERVER ASYMMETRIC KEY = ...)`.
    - `RESTORE` with `FILE` / `FILEGROUP` / `PAGE` lists, `FROM DATABASE_SNAPSHOT`, `STOPATMARK` / `STOPBEFOREMARK ... AFTER ...` and `FILESTREAM (DIRECTORY_NAME = ...)`.
    - `CREATE DATABASE` with `CONTAINMENT`, `WITH` options (including Azure's parenthesized form), `FOR ATTACH` / `ATTACH_REBUILD_LOG`, and `AS SNAPSHOT OF` / `AS COPY OF` after file specs. Each file spec wraps one option per line when it doesn't fit, and a named filegroup keeps its `FILEGROUP` keyword.

    A few rarer forms (an encryptor that isn't a server certificate or asymmetric key, a `FILESTREAM` restore option without a directory name, other attach modes) are still kept as written.

- 47e531c: In `CREATE DATABASE`, keep the case of a bracketed filegroup name with a space in it (`FILEGROUP [Archive Data]` printed as `[Archive data]` with lowercase keywords), and print `CONTAINS FILESTREAM` / `CONTAINS MEMORY_OPTIMIZED_DATA` before `DEFAULT`, the only order that parses.
- 4731e27: Keep `VARYING` on a cursor parameter (`@c CURSOR VARYING OUTPUT`). Without it the procedure does not compile.
- 8db97f8: Keep the `WITH (DISTRIBUTED_AGG)` hint on a `GROUP BY` column (Azure Synapse).
- c77535a: Keep `MOVE TO` in `ALTER TABLE ... DROP CONSTRAINT ... WITH (...)`. The option printed as just the filegroup or partition scheme (`WITH (ONLINE = ON, [PRIMARY])`), which is not valid T-SQL.
- 38d0a00: Keep `CASCADE` and `RESTRICT` in `DROP SCHEMA`.
- 7fe2f94: Keep `OPENDATASOURCE(...)` in `EXEC OPENDATASOURCE('provider', 'init').db.dbo.proc`. It was dropped, which turned the call into one to a local procedure.
- ead8bf9: Keep `FETCH NEXT n ROWS ONLY` when it has no `OFFSET` — the row limit was dropped — and keep `APPROXIMATE` in `FETCH APPROXIMATE` and `TOP (n) WITH APPROXIMATE` (SQL Server 2025).
- 403e04f: Keep `PROPERTY(column, 'name')` in `CONTAINS`, `FREETEXT`, `CONTAINSTABLE` and `FREETEXTTABLE`. It printed as the bare column, which searches the whole column instead of one document property.
- fcc4de8: Format graph `SHORTEST_PATH` queries. `WITHIN GROUP (GRAPH PATH)` made the formatter crash, and `FOR PATH` was dropped from the tables the path walks (`Person FOR PATH AS p2`).
- 5f402d3: Keep `INSERT OVER`, which printed as `INSERT INTO`.
- 90d038c: Keep `WITH ARRAY WRAPPER` in `JSON_QUERY` (SQL Server 2025).
- b6f476d: Keep the `RETURNING` clause of `JSON_VALUE`, `JSON_OBJECT`, `JSON_ARRAY`, `JSON_ARRAYAGG` and `JSON_OBJECTAGG` (SQL Server 2025). `JSON_VALUE(data, '$.price' RETURNING int)` was printed as `JSON_VALUE(data, '$.price')`, which returns `nvarchar` instead.
- adcb7d9: Keep `WITH CREDENTIAL = ...` in `CREATE LOGIN ... FROM CERTIFICATE` and `FROM ASYMMETRIC KEY`.
- 26ec3a9: Break a long `CREATE COLUMN MASTER KEY ... WITH (...)`, `CREATE/ALTER COLUMN ENCRYPTION KEY` value list, table hint list (`FROM t WITH (...)`) and `END CONVERSATION ... WITH ERROR = ... DESCRIPTION = ...` one item per line when it doesn't fit within `printWidth`.
- 8ef5bff: Put the value of a `DECLARE @x type = ...` or `SET @x = ...` on an indented line of its own when a long expression or string doesn't fit after the `=`. Calls, subqueries and `CASE` still stay next to the `=` and break inside themselves.
- f9f8ae0: Break a `CAST` / `TRY_CAST` that doesn't fit within `printWidth`: the expression and type move to an indented line between the parentheses. One whose expression spans lines (a `CASE`) still hugs the parentheses.
- cc522b5: Break a long derived-table column list (`(VALUES ...) AS v(a, b, c)` and `(SELECT ...) AS s (a, b, c)`) one column per line when it doesn't fit within `printWidth`.
- 694b668: Apply the keyword case to `MATCH` in graph queries; it was always printed as `MATCH(`.
- 70b369c: Keep `NAME = new_name` and `WITH ROLLBACK ...` / `WITH NO_WAIT` in `ALTER DATABASE ... MODIFY FILEGROUP`, and keep `READ_ONLY` / `READ_WRITE` as written instead of changing them to `READONLY` / `READWRITE`. A rename printed as `MODIFY FILEGROUP fg none`.
- 703ef3b: Break the nested part of a table option one item per line when it doesn't fit within `printWidth`: `SYSTEM_VERSIONING = ON (HISTORY_TABLE = ..., ...)`, `LEDGER = ON (LEDGER_VIEW = ... (...), APPEND_ONLY = ...)` and `REMOTE_DATA_ARCHIVE = ON (...)`, in `CREATE TABLE ... WITH (...)` and `ALTER TABLE ... SET (...)`. Options that fit stay on one line, and a single option now wraps too.
- edfeee9: Keep `NOT ENFORCED` on primary keys, unique constraints and foreign keys (Azure Synapse, Fabric).
- 3b50775: Keep the `WITH (columns)` list of `OPENROWSET(...)` and `OPENROWSET(BULK ...)`.
- e968e00: Put the subquery of `> ALL (...)`, `= ANY (...)` and `<> SOME (...)` on its own lines in standard and spacious density, like `IN` and `EXISTS`. `compact` keeps a short one inline.
- ffcfce6: Stop a statement that is kept as written (such as `CREATE DATABASE` or `BACKUP`) before a following `END CONVERSATION`. It swallowed the `END CONVERSATION` keywords, so the output had a stray `END CONVERSATION;` ahead of the real statement.
- 805f708: Format `RECEIVE` — on its own and inside `WAITFOR (RECEIVE ...)`: the column list, `FROM queue`, `INTO @table` and `WHERE conversation_handle | conversation_group_id = ...` each on their own line, with `WAITFOR (...)` wrapping the indented `RECEIVE` and `TIMEOUT` following. `WAITFOR (RECEIVE ...)` was kept on one line however long it was.
- 38a29de: Put the rows of a `VALUES` derived table on their own lines (`from (` / `values` / one row per line / `) as v(a, b)`), as a standalone `VALUES` and the PostgreSQL plugin do. `compact` density still packs them.
- 2c1e51a: Keep the frame, `PARTITION BY` and `ORDER BY` of a window that builds on a named window. `OVER (w2 ROWS UNBOUNDED PRECEDING)` was printed as `OVER w2`, which dropped everything after the name and changed the result.
- 3ca0a37: Keep the columns of a window's `PARTITION BY` on one line when they fit. They were split onto separate lines (`PARTITION BY a.x,` / `a.y`) whenever the window had more than one clause. A list that doesn't fit continues on indented lines.
- 1d6e208: Apply the keyword case to `AS` and `DEFAULT` in `WITH XMLNAMESPACES`, and keep a quote inside a namespace URI doubled (`'urn:it''s'`). It printed as a single quote, which does not parse.

## 0.9.3

### Patch Changes

- 7e83e74: Stop dropping or garbling parts of statements: `CREATE USER ... WITH PASSWORD`, `CREATE LOGIN ... FROM EXTERNAL PROVIDER`, `ALTER TABLE` forms (`ALTER COLUMN ... DROP NOT FOR REPLICATION`, column properties and `WITH (ONLINE = ...)`, `ENABLE`/`DISABLE CHANGE_TRACKING`, `DROP PERIOD FOR SYSTEM_TIME`, `SET (FILESTREAM_ON = ...)` and the history retention period of `SYSTEM_VERSIONING`), `ALTER INDEX ... SET (...)`, `ALTER SEQUENCE ... RESTART`, every `UPDATE STATISTICS` option, and `SET @a.x = 1` on a CLR type's property. `ALTER TABLE` forms the formatter doesn't model are now kept as written instead of printing a placeholder comment.
- 3e3fea8: Keep the brackets on a name that starts with `@` (`[@@SCHEMA_NAME@@].[@@OBJECT_NAME@@]`, `[@col]`), which is a variable without them, and on a name `go`, which alone on a line is a batch separator.
- 65d4bf9: Stop garbling or dropping parts of table definitions: ledger and `SUSER_SID`/`SUSER_SNAME` `GENERATED ALWAYS AS` columns printed with a space instead of an underscore (`transaction id`), `NOT FOR REPLICATION` on an inline `REFERENCES` or `CHECK` was dropped, `WITH CHECK`/`WITH NOCHECK` before `ALTER TABLE ... CHECK CONSTRAINT` was dropped, and column constraints written in an unusual order (such as `UNIQUE` before `NOT NULL`) were reordered; such columns are now kept as written.
- 571f54c: Stop a line comment from swallowing the code after it: a comment after an `IF` condition (or before the statement it guards), or in a function's header, was printed on the same line as the code that followed it, which commented that code out. Comments inside `WITH (...)` option lists, column definitions, `CREATE TABLE ... AS SELECT` and other statements printed from source text are no longer repeated or dropped, a comment between a DBCC keyword and its command or between `=` and an `ALTER DATABASE ... SET` value no longer garbles the statement, and a comment that nothing else printed is kept after its statement.
- 54b88df: Keep parts of statements the formatter used to drop or garble: the `AS SELECT` and `WITH (...)` of `CREATE TABLE ... AS SELECT`, table `WITH` options with values (`DISTRIBUTION`, `CLUSTERED COLUMNSTORE INDEX`, `LEDGER`, `REMOTE_DATA_ARCHIVE`, `FILETABLE_*`), `AS FILETABLE`, `FEDERATED ON`, the `;number` of a numbered procedure, `AS EXTERNAL NAME` for CLR triggers and table-valued functions, the scope of `DROP TRIGGER ... ON DATABASE | ALL SERVER`, and the `FROM`/`WITH` clauses of `CREATE`/`ALTER EXTERNAL LANGUAGE | LIBRARY`.
- 14e3eff: Keep comments next to what they annotate: a comment right after a CTE's opening parenthesis now leads that CTE's query, a comment after a CTE's closing parenthesis stays by it (it used to end up after the whole statement), and a comment in the middle of a column definition stays with that column.
- 0f0db67: Stop throwing on a long chain of `AND`, `OR`, `+` or `JOIN`: more than about 30 terms in one chain failed with "object depth is larger than the maximum allowed depth".
- e057d63: Keep the leading `::` of a system table function (`FROM ::fn_trace_getinfo(0)`), quote the quotes inside an `OPENQUERY` query string, and bracket a linked server name that needs it.
- f99fdfd: Handle `GO 5` (a batch repeat count): it used to be a parse error. A script with only comments, or only GO lines, was printed empty, dropping the comments; it is now kept as written. Statements printed from their source text no longer repeat a comment written inside them, `ALTER DATABASE SCOPED CONFIGURATION ... SET` no longer swallows the text up to the next semicolon (a following statement without one was duplicated, and a trailing comment ended up before the semicolon), a line comment after a comment on the same statement no longer runs into it, and a comment on its own line after the last statement stays on its own line.
- 9ae1644: An `IF` whose condition spans several lines (a long `EXISTS (...)`, say) now puts its single statement on its own line instead of after the closing parenthesis.
- ca13735: With `sqlCommaStyle: "leading"`, fill-packed lists (UPDATE SET, INSERT column lists) no longer print a stray space before the comma (`a = 1 , b = 2`).
- 24151ac: Fix more output that changed a statement's meaning: `PRIMARY KEY NONCLUSTERED HASH` indexes, user-defined column and `CAST`/`CONVERT` types (kept with their schema, brackets and case), bracketed names in foreign keys, `CHECK CONSTRAINT`, role members, databases and statistics, columns with several `CHECK` constraints, bare `IDENTITY`, parameter `NULL`/`NOT NULL`, indexes and constraints in a table-valued function's result table, `CREATE CLUSTERED COLUMNSTORE INDEX ... ORDER (...)`, `ALTER DATABASE ... SET` options whose `=` was dropped, and `CREATE DATABASE` options. `CREATE DATABASE` with options and the `BACKUP`/`RESTORE` forms with files, mirrors, encryption or stop points are now kept as written.
- 7e67ce6: Print query and table hints with their real keywords and values: `OPTION (LABEL = '...')`, `MIN_GRANT_PERCENT`/`MAX_GRANT_PERCENT`, `TABLE HINT (...)`, `CONCAT`/`HASH`/`MERGE UNION`, `PARAMETERIZATION`, `NO_PERFORMANCE_SPOOL`, `USE PLAN`, `IGNORE_NONCLUSTERED_COLUMNSTORE_INDEX`, and the table hints `SPATIAL_WINDOW_MAX_CELLS = n`, `IGNORE_CONSTRAINTS` and `IGNORE_TRIGGERS`. Index names in hints keep their case with `sqlKeywordCase: upper`.
- 9bc02ab: Stop duplicating the statements that follow an `IF`, `ELSE` or `WHILE` whose single body is a statement the formatter keeps as written (such as `CREATE EXTERNAL LANGUAGE`): the body now ends where it really ends instead of running on to the next `END`, `ELSE` or `GO`.
- b929901: Fix `<<` and `>>` printing as `LeftShift`/`RightShift`, and a column alias written as a string with a space (`AS 'two words'`) printing without quotes, which turned it into invalid SQL. `SELECT ALL a` and `COUNT(ALL a)` drop the redundant `ALL`.
- a116ab7: Stop an `IF` or `WHILE` that guards one `DECLARE @a int, @b int` from splitting it into several statements (the extra ones fell outside the `IF`, and an `ELSE` after them no longer parsed), and keep the whole text of a statement printed as written (`CREATE EXTERNAL LANGUAGE ... FROM (...)` and the like) when it is the last one in a `BEGIN ... END` or `TRY` block, where its `FROM` and `WITH` clauses were dropped.
- d0a7dd6: Write the size of a built-in type as `(10, 2)` wherever it appears (`ALTER COLUMN`, `CAST`, `DECLARE`, parameters), as a column definition already did, instead of keeping the input's spacing.
- d9098ca: Keep the case of identifiers the formatter used to upper-case with `sqlKeywordCase: upper`: xml schema collections in `xml(dbo.Sc)` types (parameters, `ALTER COLUMN`, `CAST`, function return types), user-defined function return types, and logical `BACKUP`/`RESTORE` device names. `DECLARE @x xml(dbo.Sc)` no longer drops its schema collection, and `BACKUP` options `EXPIREDATE`, `RETAINDAYS`, `MEDIANAME`, `BLOCKSIZE`, `BUFFERCOUNT` and `MAXTRANSFERSIZE` print with their real keywords.

## 0.9.2

### Patch Changes

- 83dbdd2: A hash index's `BUCKET_COUNT` option kept its value but dropped the option name (`WITH (1024)`), which doesn't parse.
- c3d347f: A trailing comment on a `WHILE` or `IF` condition (or other standalone predicate, e.g. a `CHECK` constraint) is now printed right after the condition; it was claimed internally but never printed, so it moved to the end of the statement.
- de9e263: A `FOREIGN KEY ... REFERENCES table` with no explicit referenced-column list no longer prints an empty `()`, which doesn't parse.
- bafed5a: A comment right after a joined table and before its `ON` clause now stays there instead of drifting past the condition on reformat.
- 93e14e3: `MERGE ... USING source -- comment` keeps the comment right after the source table instead of it drifting past `ON` onto the wrong line.
- 0ffc250: Two comments that attach to the same node (e.g. one after each side of a `UNION ALL`) now print on separate lines instead of running together as a single comment.
- 0c19794: A natively compiled `CREATE FUNCTION`'s `BEGIN ATOMIC WITH (...)` body no longer gets wrapped in an extra `BEGIN ... END`, and its option names (`TRANSACTION ISOLATION LEVEL`, `LANGUAGE`, ...) are keyword-cased per `sqlKeywordCase` instead of always printing uppercase.
- 9358b6f: `CROSS APPLY t.x.nodes(...) AS n(x)` keeps the alias's column list; it was being dropped.
- 4332e9c: Fix a non-idempotent trailing comment on `ORDER BY`: once `ASC` is spelled out on reformat, the comment attaches to the `ORDER BY` element instead of its sort expression, and used to be dropped.
- 99335a6: `CREATE TRIGGER ... ON ALL SERVER ... FOR LOGON` keeps its `ALL SERVER` scope and `LOGON` event; both were dropped, producing unparseable output.

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
