---
"prettier-plugin-tsql": patch
---

`CREATE SCHEMA` keeps the tables, views and permissions created with it (`CREATE SCHEMA s CREATE TABLE ... GRANT ...`); they were dropped.
