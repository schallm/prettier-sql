---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": minor
---

Lay out `AND` / `OR` the same way in both dialects. Parenthesized predicates — `(a OR b)`, `NOT (a AND b)` — stay on one line when they fit. A `JOIN ... ON` chain follows `ON`, with further predicates on indented lines (T-SQL), and a single long `ON` predicate moves whole to an indented line (PostgreSQL). In T-SQL, compact density keeps a `WHERE` that fits on the `WHERE` line, and an `AND` inside an `OR` stays on its predicate's line instead of getting a line of its own.
