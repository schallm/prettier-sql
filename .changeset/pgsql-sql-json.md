---
"prettier-plugin-postgresql": patch
---

Format the rest of the SQL/JSON syntax, which used to make the formatter fail: `x IS [NOT] JSON [VALUE | ARRAY | OBJECT | SCALAR] [WITH UNIQUE KEYS]`, `JSON_SCALAR`, `JSON_SERIALIZE`, `JSON(...)` and `JSON_ARRAY(SELECT ...)`. `XMLTABLE(XMLNAMESPACES(...), ...)` and the column list of an `XMLTABLE` / `JSON_TABLE` alias (`AS t(a, b)`) were silently dropped and are kept now.
