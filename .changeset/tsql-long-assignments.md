---
"prettier-plugin-tsql": patch
---

Put the value of a `DECLARE @x type = ...` or `SET @x = ...` on an indented line of its own when a long expression or string doesn't fit after the `=`. Calls, subqueries and `CASE` still stay next to the `=` and break inside themselves.
