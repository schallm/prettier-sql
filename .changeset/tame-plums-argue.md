---
"prettier-plugin-tsql": minor
---

Add Always Encrypted support: `CREATE/DROP COLUMN MASTER KEY`, `CREATE/ALTER/DROP COLUMN
ENCRYPTION KEY`, and the column-level `ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ...,
ENCRYPTION_TYPE = ..., ALGORITHM = ...)` clause are now parsed and reformatted structurally
instead of being preserved as raw passthrough text.
