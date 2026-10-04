---
"prettier-plugin-tsql": patch
---

Break a long `CREATE COLUMN MASTER KEY ... WITH (...)`, `CREATE/ALTER COLUMN ENCRYPTION KEY` value list, table hint list (`FROM t WITH (...)`) and `END CONVERSATION ... WITH ERROR = ... DESCRIPTION = ...` one item per line when it doesn't fit within `printWidth`.
