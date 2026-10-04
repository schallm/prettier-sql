---
"prettier-plugin-tsql": patch
---

Keep the `RETURNING` clause of `JSON_VALUE`, `JSON_OBJECT`, `JSON_ARRAY`, `JSON_ARRAYAGG` and `JSON_OBJECTAGG` (SQL Server 2025). `JSON_VALUE(data, '$.price' RETURNING int)` was printed as `JSON_VALUE(data, '$.price')`, which returns `nvarchar` instead.
