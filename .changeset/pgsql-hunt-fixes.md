---
"prettier-plugin-postgresql": patch
---

Fixes found by formatting PostgreSQL's regression tests:

- A string holding a carriage return or another control character (other than a newline or tab) is written as an escape string, `E'a\rb'`. Written raw, the next format or an editor's line-ending normalization turned `\r` into a newline, changing the value.
- `ONLY` is kept in `VACUUM ONLY`, `ANALYZE ONLY` and publication tables (`CREATE PUBLICATION … FOR TABLE ONLY t`); it was dropped, taking in inheritance children and partitions.
- `LATERAL` is kept before `XMLTABLE(…)` and `JSON_TABLE(…)`.
- `CREATE SCHEMA … AUTHORIZATION CURRENT_ROLE` (or `CURRENT_USER`, `SESSION_USER`) keeps its `AUTHORIZATION`; it was dropped.
- `OFFSET (n - 1) ROWS` and `FETCH FIRST (n * 2) ROWS WITH TIES` keep the parentheses around a computed count; without them the output didn't parse.
- A cast written as a `FROM` item (`FROM CAST(x AS int)`, also inside `ROWS FROM (…)`) keeps its `CAST(… AS …)` form; printed as `x::integer` it didn't parse.
- `CREATE COLLATION c (FROM = s)` keeps its source collation; it printed as `CREATE COLLATION c ()`, which didn't parse.
- `SELECT … INTO t` keeps all of the query's clauses (`DISTINCT`, `WITH …`, `FOR UPDATE`, `WINDOW`), and an `INTO` in a `UNION`'s first query or in a subquery is kept; they were dropped.
- `CREATE INDEX ON t (…)` without a name no longer prints a double space.
- With `sqlKeywordCase: 'preserve'`, a short statement with none of the common keywords (`END;`, `CLUSTER t`, `COPY … TO STDOUT`) keeps the case its first word is written in; it fell back to lower case, and formatting upper-case output again could change its case.
- `VACUUM (INDEX_CLEANUP ON)` and other utility options print `ON` / `OFF` in the keyword case; they were always lower case.
- `FOR VALUES WITH (MODULUS 0, REMAINDER 1)` is kept (PostgreSQL rejects it when run, but it parses); it was dropped, leaving output that didn't parse.
- A quoted mixed-case option name in `CREATE AGGREGATE` / `CREATE OPERATOR` (`"Sfunc" = f`) keeps its quotes; without them it named a different option, or didn't parse.
- A typed constant in a recursive query's `CYCLE … SET m TO point '(1,1)' DEFAULT …` keeps its `type 'value'` spelling; printed as `'(1,1)'::point` it didn't parse.
- `XMLTABLE((…) PASSING (…))` and `XMLEXISTS((…) PASSING (…))` keep the parentheses around an operator expression or a `::` cast; without them the output didn't parse.
- A `JSON_TABLE` column written `c boolean EXISTS` (no path) no longer prints `EXISTS PATH` with nothing after it, which didn't parse.
- An index or partition key that is a call with `OVER`, `FILTER` or `WITHIN GROUP` keeps its parentheses; without them the output didn't parse.
- An index key written as an operator (`(ts AT TIME ZONE 'UTC')`, `OVERLAPS`), and an `IN (subquery)` passed to `XMLEXISTS` / `XMLTABLE`, keep their parentheses; the output didn't parse.
