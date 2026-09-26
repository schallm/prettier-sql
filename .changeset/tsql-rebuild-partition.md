---
"prettier-plugin-tsql": patch
---

`ALTER TABLE ... REBUILD` without a partition no longer prints an empty `PARTITION =`, and partition numbers given as variables (`REBUILD PARTITION = @p`, `SWITCH PARTITION @p`) are kept.
