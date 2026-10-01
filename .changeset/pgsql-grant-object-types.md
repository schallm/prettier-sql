---
"prettier-plugin-postgresql": patch
---

Print every GRANT / REVOKE object type correctly: `FOREIGN SERVER`, `TYPE`, `DOMAIN`, `LARGE OBJECT`, `PARAMETER`, `ALL PROCEDURES IN SCHEMA` and the rest, instead of an internal name or a missing object name.
