---
"prettier-plugin-postgresql": patch
---

Keep the parentheses that change meaning in `(a AT TIME ZONE b) COLLATE c`, `(@ a) + c` and other prefix operators, a `BETWEEN` bound or column `DEFAULT` holding `AND`, `LIKE`, `AT TIME ZONE`, `COLLATE` and the like, and a nested `a AND (b AND c)`.
