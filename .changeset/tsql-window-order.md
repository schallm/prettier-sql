---
"prettier-plugin-tsql": patch
---

A `WINDOW` clause is printed before `ORDER BY`, where T-SQL requires it; after it, the output didn't parse.
