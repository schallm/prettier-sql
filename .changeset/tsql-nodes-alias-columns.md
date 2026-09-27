---
"prettier-plugin-tsql": patch
---

`CROSS APPLY t.x.nodes(...) AS n(x)` keeps the alias's column list; it was being dropped.
