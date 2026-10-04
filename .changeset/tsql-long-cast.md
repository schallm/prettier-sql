---
"prettier-plugin-tsql": patch
---

Break a `CAST` / `TRY_CAST` that doesn't fit within `printWidth`: the expression and type move to an indented line between the parentheses. One whose expression spans lines (a `CASE`) still hugs the parentheses.
