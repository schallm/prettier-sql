---
"prettier-plugin-tsql": patch
---

Stop dropping or garbling parts of statements: `CREATE USER ... WITH PASSWORD`, `CREATE LOGIN ... FROM EXTERNAL PROVIDER`, `ALTER TABLE` forms (`ALTER COLUMN ... DROP NOT FOR REPLICATION`, column properties and `WITH (ONLINE = ...)`, `ENABLE`/`DISABLE CHANGE_TRACKING`, `DROP PERIOD FOR SYSTEM_TIME`, `SET (FILESTREAM_ON = ...)` and the history retention period of `SYSTEM_VERSIONING`), `ALTER INDEX ... SET (...)`, `ALTER SEQUENCE ... RESTART`, every `UPDATE STATISTICS` option, and `SET @a.x = 1` on a CLR type's property. `ALTER TABLE` forms the formatter doesn't model are now kept as written instead of printing a placeholder comment.
