---
"prettier-plugin-tsql": patch
---

Stop duplicating the statements that follow an `IF`, `ELSE` or `WHILE` whose single body is a statement the formatter keeps as written (such as `CREATE EXTERNAL LANGUAGE`): the body now ends where it really ends instead of running on to the next `END`, `ELSE` or `GO`.
