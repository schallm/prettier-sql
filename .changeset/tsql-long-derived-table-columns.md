---
"prettier-plugin-tsql": patch
---

Break a long derived-table column list (`(VALUES ...) AS v(a, b, c)` and `(SELECT ...) AS s (a, b, c)`) one column per line when it doesn't fit within `printWidth`.
