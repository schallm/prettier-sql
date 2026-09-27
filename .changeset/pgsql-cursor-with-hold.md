---
"prettier-plugin-postgresql": patch
---

`DECLARE ... CURSOR WITH HOLD` no longer drops `WITH HOLD`; `BINARY` cursors were also silently dropped (the option bit checked didn't match the one PostgreSQL actually sets).
