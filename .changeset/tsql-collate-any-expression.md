---
"prettier-plugin-tsql": patch
---

`COLLATE` is kept after any expression — literals, variables, function calls, `CAST`, `CASE`, subqueries and parenthesized expressions. It was only kept after column names and silently dropped elsewhere, changing how comparisons and sorts behave.
