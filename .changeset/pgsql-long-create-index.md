---
"prettier-plugin-postgresql": patch
---

Wrap a `CREATE INDEX` that doesn't fit within `printWidth`: `ON table USING method (...)` moves to an indented line when it can't follow the index name, and `INCLUDE`, `NULLS NOT DISTINCT`, `WITH`, `TABLESPACE` and `WHERE` each go on an indented line of their own when they don't all fit after the column list. A statement that fits stays on one line.
