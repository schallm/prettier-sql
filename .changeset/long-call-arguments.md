---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Break the arguments of a function call that doesn't fit within `printWidth` onto their own lines, one per line, with the closing parenthesis on its own line. PostgreSQL's `COALESCE` and `ROWS FROM (...)` and T-SQL's `COALESCE`, `IIF`, `NULLIF`, `CONVERT` and `TRY_CONVERT` stayed on one line however long they were; they now break like other calls.
