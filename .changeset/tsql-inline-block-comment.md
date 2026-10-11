---
"prettier-plugin-tsql": patch
---

Keep a `/* comment */` on the line of the statement it follows. Inside `IF`, `WHILE` or a `BEGIN ... END` block it moved to a line of its own, and the next format moved it again, into the next statement or the `ELSE` branch.
