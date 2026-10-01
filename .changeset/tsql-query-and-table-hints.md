---
"prettier-plugin-tsql": patch
---

Print query and table hints with their real keywords and values: `OPTION (LABEL = '...')`, `MIN_GRANT_PERCENT`/`MAX_GRANT_PERCENT`, `TABLE HINT (...)`, `CONCAT`/`HASH`/`MERGE UNION`, `PARAMETERIZATION`, `NO_PERFORMANCE_SPOOL`, `USE PLAN`, `IGNORE_NONCLUSTERED_COLUMNSTORE_INDEX`, and the table hints `SPATIAL_WINDOW_MAX_CELLS = n`, `IGNORE_CONSTRAINTS` and `IGNORE_TRIGGERS`. Index names in hints keep their case with `sqlKeywordCase: upper`.
