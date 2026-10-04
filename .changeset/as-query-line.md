---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": minor
---

End the header of a statement defined by a query with its `AS` or `FOR`, and start the query on the next line: `CREATE VIEW v AS`, `CREATE TABLE t AS`, `DECLARE c CURSOR FOR` and T-SQL's `SET @c = CURSOR FOR`. `AS` / `FOR` used to go on a line of its own in T-SQL, and before `CREATE VIEW`'s query in PostgreSQL. In T-SQL, comments between a view's header and its `AS` now go after the `AS`, above the query.
