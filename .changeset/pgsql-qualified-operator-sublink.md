---
"prettier-plugin-postgresql": patch
---

A schema-qualified operator in `ANY` / `ALL` (`a OPERATOR(pg_catalog.=) ANY (...)`) is kept; it printed the schema name as the operator, which doesn't parse.
