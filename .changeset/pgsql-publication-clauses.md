---
"prettier-plugin-postgresql": patch
---

`CREATE PUBLICATION` keeps its per-table column list, `WHERE` filter, `TABLES IN SCHEMA`/`TABLES IN SCHEMA CURRENT_SCHEMA`, and `WITH (...)` options — all were silently dropped. Fixed a related bug where a `WITH (...)` reloption's quoted string value (e.g. `publish = 'insert'`) printed without quotes, changing its meaning on reparse.
