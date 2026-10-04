---
"prettier-plugin-postgresql": patch
---

Break a long column list one column per line when it doesn't fit within `printWidth`: the columns and `INCLUDE` list of `CREATE INDEX`, the columns of `CREATE VIEW` and `CREATE TABLE AS`, the column list of `COPY`, and the key columns of `PRIMARY KEY`, `UNIQUE` and `FOREIGN KEY ... REFERENCES` constraints.
