---
"prettier-plugin-tsql": patch
---

Fix more output that changed a statement's meaning: `PRIMARY KEY NONCLUSTERED HASH` indexes, user-defined column and `CAST`/`CONVERT` types (kept with their schema, brackets and case), bracketed names in foreign keys, `CHECK CONSTRAINT`, role members, databases and statistics, columns with several `CHECK` constraints, bare `IDENTITY`, parameter `NULL`/`NOT NULL`, indexes and constraints in a table-valued function's result table, `CREATE CLUSTERED COLUMNSTORE INDEX ... ORDER (...)`, `ALTER DATABASE ... SET` options whose `=` was dropped, and `CREATE DATABASE` options. `CREATE DATABASE` with options and the `BACKUP`/`RESTORE` forms with files, mirrors, encryption or stop points are now kept as written.
