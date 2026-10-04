---
"prettier-plugin-postgresql": patch
---

Keep `TO value DEFAULT value` in a recursive CTE's `CYCLE ... SET mark` clause. It was dropped, which changed the mark to `TRUE` / `FALSE`.
