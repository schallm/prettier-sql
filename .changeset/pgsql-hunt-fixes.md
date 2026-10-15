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
