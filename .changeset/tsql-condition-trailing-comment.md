---
"prettier-plugin-tsql": patch
---

A trailing comment on a `WHILE` or `IF` condition (or other standalone predicate, e.g. a `CHECK` constraint) is now printed right after the condition; it was claimed internally but never printed, so it moved to the end of the statement.
