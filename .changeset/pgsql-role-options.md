---
"prettier-plugin-postgresql": patch
---

`CREATE ROLE`/`ALTER ROLE` keep `VALID UNTIL`, `IN ROLE`, `ROLE`, `ADMIN`, and `SYSID` — they were silently dropped.
