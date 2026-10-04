---
"prettier-plugin-tsql": patch
---

Keep `VARYING` on a cursor parameter (`@c CURSOR VARYING OUTPUT`). Without it the procedure does not compile.
