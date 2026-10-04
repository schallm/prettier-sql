---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Move the right-hand side of a comparison, `LIKE`, `IS DISTINCT FROM` or other binary operator onto an indented line after the operator when it doesn't fit within `printWidth`, if neither side can break on its own. A call, subquery, `CASE` or wrapped chain next to the operator is unchanged.
