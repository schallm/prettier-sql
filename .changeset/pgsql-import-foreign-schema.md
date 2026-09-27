---
"prettier-plugin-postgresql": patch
---

`IMPORT FOREIGN SCHEMA` keeps `LIMIT TO (...)`, `EXCEPT (...)`, and `OPTIONS (...)`; all three were silently dropped.
