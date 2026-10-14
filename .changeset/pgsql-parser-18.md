---
"prettier-plugin-postgresql": minor
---

Parse with PostgreSQL 18's grammar (pgsqlparser 2.1.0). Fixes `ALTER TABLE ... ALTER CONSTRAINT c [NOT] DEFERRABLE`, which lost the constraint name, and operator chains up to about 2000 long (`a || b || ...`) now format, where about 50 was the limit. Linux x64, macOS and Windows x64 remain the supported platforms.
