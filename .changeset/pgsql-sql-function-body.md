---
"prettier-plugin-postgresql": patch
---

Format SQL-standard function bodies (`CREATE FUNCTION ... RETURN expr`, `BEGIN ATOMIC ... END` for functions and procedures), expressions in partition bounds (`FOR VALUES FROM (date '2020-01-01') TO (...)`, `IN (1 + 1)`) and `GENERATED ... AS IDENTITY (SEQUENCE NAME s)`, which used to make the formatter fail.
