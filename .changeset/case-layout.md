---
"prettier-plugin-postgresql": minor
---

Lay out `CASE` as the T-SQL plugin does: a `CASE` that is the only column starts on its own line under `SELECT`, a nested `CASE` after `THEN` / `ELSE` starts on an indented line, a searched `WHEN` with an `AND` / `OR` condition puts the condition on indented lines of its own, and a call whose only argument spans lines (`sum(case ... end)`) puts that argument on its own lines inside the parentheses.
