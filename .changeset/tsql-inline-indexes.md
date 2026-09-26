---
"prettier-plugin-tsql": patch
---

Indexes declared in a table body are kept: column-level `INDEX ix` in `CREATE TABLE`, and `INDEX` definitions in table variables and table types, along with a table type's `WITH (MEMORY_OPTIMIZED = ON)`. All were dropped.
