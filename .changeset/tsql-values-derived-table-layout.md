---
"prettier-plugin-tsql": patch
---

Put the rows of a `VALUES` derived table on their own lines (`from (` / `values` / one row per line / `) as v(a, b)`), as a standalone `VALUES` and the PostgreSQL plugin do. `compact` density still packs them.
