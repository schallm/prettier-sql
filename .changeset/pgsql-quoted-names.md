---
"prettier-plugin-postgresql": patch
---

Keep `OPERATOR()` around a schema-qualified `ORDER BY ... USING` operator, the schema and quotes of a `TABLESAMPLE` method, and the quotes on `DO LANGUAGE`, `ALTER SYSTEM` parameter names and storage and FDW option names.
