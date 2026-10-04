---
"prettier-plugin-tsql": patch
---

Break the nested part of a table option one item per line when it doesn't fit within `printWidth`: `SYSTEM_VERSIONING = ON (HISTORY_TABLE = ..., ...)`, `LEDGER = ON (LEDGER_VIEW = ... (...), APPEND_ONLY = ...)` and `REMOTE_DATA_ARCHIVE = ON (...)`, in `CREATE TABLE ... WITH (...)` and `ALTER TABLE ... SET (...)`. Options that fit stay on one line, and a single option now wraps too.
