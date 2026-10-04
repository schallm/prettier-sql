---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Lay out a `MERGE ... INSERT` the same way in both dialects: `VALUES` goes on its own line after a column list (on the `INSERT` line in compact density, when it fits), a long column list breaks like any other, and without a column list `INSERT VALUES (...)` / `INSERT DEFAULT VALUES` stays on one line.
