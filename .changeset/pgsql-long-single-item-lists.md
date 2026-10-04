---
"prettier-plugin-postgresql": patch
---

Wrap a column or expression list that doesn't fit within `printWidth` even when it holds a single item: the columns of `CREATE INDEX` and `INCLUDE`, `PARTITION BY (...)`, `SELECT DISTINCT ON (...)` and the bounds of `FOR VALUES FROM (...) TO (...)` / `FOR VALUES IN (...)`. `PARTITION BY`, `DISTINCT ON` and the partition bounds never wrapped before.
