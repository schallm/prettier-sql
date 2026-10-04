---
"prettier-plugin-postgresql": minor
---

Put the `AS` of `CREATE TABLE ... AS` and `CREATE MATERIALIZED VIEW ... AS`, and the `FOR` of `DECLARE ... CURSOR FOR`, on a line of its own before the query, as `CREATE VIEW ... AS` already was (and as the T-SQL plugin does).
