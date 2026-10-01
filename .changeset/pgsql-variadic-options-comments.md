---
"prettier-plugin-postgresql": patch
---

Keep `VARIADIC` in function calls (`f(VARIADIC arr)`), operator-valued options (`commutator = ===`, `sortop = <`) and numeric options of `CREATE AGGREGATE` / `OPERATOR` / `TYPE`, `t.a%TYPE` in function signatures, and the comments of a script that has no statements; these were silently dropped. An option value of a kind the formatter cannot print now raises an error instead of vanishing.
