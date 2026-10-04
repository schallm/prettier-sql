---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Wrap a long `IN (...)` list or `ARRAY[...]` that doesn't fit within `printWidth`. A list of literals packs as many to a line as fit, between parentheses on their own lines; a list of other expressions puts one per line. PostgreSQL's `IN` list and `ARRAY[...]` never wrapped; T-SQL's `IN` list now packs literals instead of one per line.
