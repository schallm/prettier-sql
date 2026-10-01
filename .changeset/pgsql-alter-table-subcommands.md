---
"prettier-plugin-postgresql": patch
---

Format the remaining `ALTER TABLE` / `ALTER INDEX` / `ALTER VIEW` / `ALTER MATERIALIZED VIEW` / `ALTER FOREIGN TABLE` / `ALTER SEQUENCE` subcommands: `OWNER TO`, `SET TABLESPACE`, `SET (...)` / `RESET (...)`, identity (`ADD GENERATED`, `SET GENERATED`, `RESTART`, `DROP IDENTITY`), `DROP EXPRESSION`, `SET EXPRESSION`, `SET STATISTICS`, `SET STORAGE`, `SET COMPRESSION`, `VALIDATE` / `ALTER CONSTRAINT`, trigger and rule enable/disable, row level security, `CLUSTER ON`, `SET LOGGED` / `UNLOGGED`, `INHERIT`, `OF`, `REPLICA IDENTITY`, `ATTACH` / `DETACH PARTITION`, and foreign table `OPTIONS`. These used to make the formatter fail. A partition bound value it cannot print now fails loudly instead of being dropped.
