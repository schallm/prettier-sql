---
"prettier-plugin-tsql": patch
---

Kept clauses that were dropped from DML: `OPTION (...)` query hints on `INSERT`, `UPDATE`, `DELETE` and `MERGE`; column names on a derived table (`(SELECT ...) AS s (a, b)`); and `MERGE ... INSERT DEFAULT VALUES`, which printed as `insert values ()`.
