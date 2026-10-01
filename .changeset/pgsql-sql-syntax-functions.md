---
"prettier-plugin-postgresql": patch
---

Print `(a, b) OVERLAPS (c, d)`, `x IS [NOT] [NFC] NORMALIZED`, `NORMALIZE(x, NFC)`, `SYSTEM_USER`, `COLLATION FOR (x)` and `XMLEXISTS(path PASSING doc)` as SQL syntax instead of the `pg_catalog` function call they parse to, which meant something else.
