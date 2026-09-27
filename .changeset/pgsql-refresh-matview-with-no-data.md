---
"prettier-plugin-postgresql": patch
---

`REFRESH MATERIALIZED VIEW ... WITH NO DATA` keeps the `WITH NO DATA` clause instead of silently dropping it.
