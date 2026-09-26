---
"prettier-plugin-tsql": patch
---

Storage clauses are kept on indexes and constraints: `ON scheme(column)` keeps its partitioning column, and `ON filegroup` / `FILESTREAM_ON` are no longer dropped from constraints, inline indexes, `CREATE INDEX` and columnstore indexes. Column-level `PRIMARY KEY` / `UNIQUE` also keep their `WITH (...)` options.
