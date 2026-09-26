---
"prettier-plugin-tsql": patch
---

Triggers keep their `WITH` options (`EXECUTE AS`, `ENCRYPTION`, ...), procedures keep `FOR REPLICATION`, and an `EXECUTE AS 'principal'` containing a quote is escaped.
