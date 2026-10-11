---
"prettier-plugin-tsql": patch
---

Apply `sqlKeywordCase` to index options in `WITH (...)` (`PAD_INDEX = OFF`, `FILLFACTOR = 80`) of `CREATE INDEX`, `ALTER INDEX` and key constraints; they kept the input's case.
