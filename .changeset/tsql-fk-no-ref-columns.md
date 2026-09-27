---
"prettier-plugin-tsql": patch
---

A `FOREIGN KEY ... REFERENCES table` with no explicit referenced-column list no longer prints an empty `()`, which doesn't parse.
