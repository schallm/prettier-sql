---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

In compact density, the query after a `WITH` and a `SELECT ... INTO` collapse to one line when they fit (PostgreSQL), and in spacious density a `WITHIN GROUP (ORDER BY ...)` or `JSON_ARRAYAGG(... ORDER BY ...)` stays inside its parentheses on one line (T-SQL).
