---
"prettier-plugin-tsql": patch
---

Stop an `IF` or `WHILE` that guards one `DECLARE @a int, @b int` from splitting it into several statements (the extra ones fell outside the `IF`, and an `ELSE` after them no longer parsed), and keep the whole text of a statement printed as written (`CREATE EXTERNAL LANGUAGE ... FROM (...)` and the like) when it is the last one in a `BEGIN ... END` or `TRY` block, where its `FROM` and `WITH` clauses were dropped.
