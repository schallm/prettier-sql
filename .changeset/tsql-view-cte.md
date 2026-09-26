---
"prettier-plugin-tsql": patch
---

A view whose body starts with `WITH` keeps its CTEs (and `XMLNAMESPACES`); they were dropped, leaving a view that referenced a missing name. View column names that need brackets keep them.
