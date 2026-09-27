---
"prettier-plugin-postgresql": patch
---

`CREATE FOREIGN TABLE` keeps per-column `OPTIONS (...)`; they were silently dropped.
