---
"prettier-plugin-postgresql": patch
---

Put the options of `CREATE ROLE` / `CREATE USER` / `ALTER ROLE` one per line, indented under the name, when they don't fit on one line within `printWidth`. Options that fit stay on one line below the name, as before.
