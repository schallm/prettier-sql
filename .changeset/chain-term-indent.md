---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Indent a term of a wrapped `+` / `-` / `||` chain as a block, so a call or `CASE` that breaks inside it lines its closing parenthesis up under the term's operator instead of two columns to the left of it.
