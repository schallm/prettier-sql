---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Break a parenthesized option list that doesn't fit within `printWidth` — `WITH (...)`, `OPTIONS (...)`, `SET (...)`, `ENCRYPTED WITH (...)`, `COPY ... (...)`, `EXPLAIN (...)`, `VACUUM (...)`, `RESULT SETS (...)`, `OPTION (...)` and the like — with one option per line between parentheses. A list that fits stays on one line.
