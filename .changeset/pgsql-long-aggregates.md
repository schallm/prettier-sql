---
"prettier-plugin-postgresql": patch
---

Wrap an aggregate call with `ORDER BY` inside its parentheses and a `FILTER (WHERE ...)` clause that don't fit within `printWidth`. The `ORDER BY` goes on its own line after the arguments, and the filter condition breaks inside its parentheses. A call with one argument and an `ORDER BY` used to stay on one line however long it was, and the filter's own comparison split instead.
