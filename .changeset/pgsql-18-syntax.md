---
"prettier-plugin-postgresql": patch
---

Format PostgreSQL 18 syntax: `RETURNING old.*, new.*` and `RETURNING WITH (OLD AS o, NEW AS n)`, virtual generated columns (`GENERATED ALWAYS AS (...) VIRTUAL`, also printed when neither `VIRTUAL` nor `STORED` is written), `NOT ENFORCED` / `ENFORCED` on check and foreign-key constraints, temporal keys (`WITHOUT OVERLAPS`, `PERIOD`), named table-level `CONSTRAINT n NOT NULL col`, and `ALTER CONSTRAINT ... [NOT] ENFORCED` / `[NO] INHERIT`.
