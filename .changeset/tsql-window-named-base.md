---
"prettier-plugin-tsql": patch
---

Keep the frame, `PARTITION BY` and `ORDER BY` of a window that builds on a named window. `OVER (w2 ROWS UNBOUNDED PRECEDING)` was printed as `OVER w2`, which dropped everything after the name and changed the result.
