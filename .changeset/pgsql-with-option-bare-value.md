---
"prettier-plugin-postgresql": patch
---

A bare-identifier `WITH (...)` option value (e.g. `fastupdate = off`) no longer drops the value; it applies to every `WITH (...)` clause that shares the option-value builder (`CREATE TABLE`, `CREATE INDEX`, constraints, etc).
