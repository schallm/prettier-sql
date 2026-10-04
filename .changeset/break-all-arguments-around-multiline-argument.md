---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

When one argument of a call or `IN` list spans lines (a `CASE` or a subquery) and there is more than one argument, put every argument on its own line instead of leaving the others to run past `printWidth` next to the closing parenthesis. A call with a single such argument, like `SUM(CASE ... END)`, is unchanged.
