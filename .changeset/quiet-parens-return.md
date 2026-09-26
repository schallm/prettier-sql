---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

PostgreSQL: formatting no longer changes what a query means.

- Parentheses are kept wherever operator precedence needs them. Previously every
  parenthesis was dropped, so `(a + b) * c` became `a + b * c` and
  `(x or y) and z` became `x or y and z`.
- Double-quoted identifiers keep their quotes. Previously `"My Table"` printed as
  `My Table` (invalid SQL) and `"MixedCase"(1)` as `mixedcase(1)` (a different
  function). Names are now quoted exactly when PostgreSQL requires it.
- `IS TRUE` / `IS NOT FALSE` / `IS UNKNOWN` no longer print as `is istrue` etc.

T-SQL: `sqlKeywordCase` no longer recases the inside of double-quoted names.
