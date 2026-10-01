---
"prettier-plugin-postgresql": patch
---

Keep the whole `PARTITION BY` element (`((lower(a)))`, `COLLATE`, operator class), `PARTITION OF` with its columns, storage and `IF NOT EXISTS`/`UNLOGGED`, foreign tables' `PARTITION OF` and `INHERITS` and column `OPTIONS` before constraints, and `CREATE [OR REPLACE] AGGREGATE` arguments (`ORDER BY`, `*`, `VARIADIC`, argument names). `DROP`/`ALTER`/`COMMENT ON AGGREGATE a(*)` keep their `*`.
