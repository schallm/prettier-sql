---
"prettier-plugin-postgresql": patch
---

`LIKE ... INCLUDING ALL EXCLUDING x` in `CREATE TABLE` no longer drops the `EXCLUDING` clauses; the `COMPRESSION` option was also missing from the `INCLUDING`/`EXCLUDING` list.
