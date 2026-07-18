---
"prettier-plugin-postgresql": patch
---

Fix several remaining silent-data-loss fallbacks left over from the earlier
"fail loudly" fix: `WITH cte AS (...)`, `COPY (...) TO ...`, `PREPARE ... AS ...`, and
`EXPLAIN ...` all silently dropped their inner query when it was a writable `MERGE` (and
`EXPLAIN` additionally for `CREATE TABLE AS`/`CREATE MATERIALIZED VIEW`, `DECLARE CURSOR`,
`REFRESH MATERIALIZED VIEW`, and `EXECUTE`, despite formatters for all of these already
existing). `DROP CAST`/`DROP OPERATOR CLASS`/`DROP OPERATOR FAMILY` similarly lost their
object name. All of these now format correctly when a builder exists, or throw a clear
"Unsupported ..." error instead of silently producing wrong SQL.
