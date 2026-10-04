---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": patch
---

In compact density a subquery after `IN`, a comparison or `ANY` / `ALL` stays on one line when it fits (PostgreSQL), and a `CROSS JOIN` / `APPLY` stays on the `FROM` line when it fits (T-SQL). `NOT x IN (subquery)` prints as `x NOT IN (subquery)` (PostgreSQL), and a comparison under `NOT` gets parentheses — `NOT (a = 1)` — in both.
