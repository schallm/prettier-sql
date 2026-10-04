---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": patch
---

Put a space before an alias's or CTE's column list, `AS s (a, b)` and `cte (a, b) AS (...)`, as before any other column list (PostgreSQL, and T-SQL's `(VALUES ...)`), and before a `TABLESAMPLE` method's argument, `TABLESAMPLE SYSTEM (5)` (PostgreSQL). A `(VALUES ...)` derived table lays out its rows as a standalone `VALUES` does (T-SQL).
