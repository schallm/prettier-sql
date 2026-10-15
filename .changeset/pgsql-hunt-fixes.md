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
