---
"prettier-plugin-tsql": patch
---

Format the `EXECUTE` of `INSERT ... EXECUTE` like any other `EXECUTE`; it was kept as written, ignoring `sqlKeywordCase`.
