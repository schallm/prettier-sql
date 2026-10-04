---
"prettier-plugin-tsql": patch
---

Keep `MOVE TO` in `ALTER TABLE ... DROP CONSTRAINT ... WITH (...)`. The option printed as just the filegroup or partition scheme (`WITH (ONLINE = ON, [PRIMARY])`), which is not valid T-SQL.
