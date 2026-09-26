---
"prettier-plugin-tsql": patch
---

`DROP INDEX` keeps its `WITH (ONLINE = ON, MOVE TO ...)` options, and the old `DROP INDEX table.index` form is supported (it printed `drop index ;`).
