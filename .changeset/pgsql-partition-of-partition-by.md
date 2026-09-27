---
"prettier-plugin-postgresql": patch
---

`CREATE TABLE ... PARTITION OF ... PARTITION BY ...` keeps its trailing `PARTITION BY` clause instead of dropping it.
