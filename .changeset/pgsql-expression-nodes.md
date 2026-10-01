---
"prettier-plugin-postgresql": patch
---

Format `DEFAULT` in `VALUES` and `SET`, multi-column assignment (`SET (a, b) = (1, 2)`, `= (SELECT ...)`), `expr COLLATE "C"`, `WHERE CURRENT OF cursor`, `merge_action()` and bit-string literals (`B'101'`, `X'ff'`), which used to make the formatter fail.
