---
"prettier-plugin-postgresql": patch
---

Break a long alias column list (`AS x(a, b, c)`), column definition list (`AS x(a integer, b text)`) and `JOIN ... USING (...)` list one per line when it doesn't fit within `printWidth`. A long alias after a function call no longer pushes the call's own arguments onto separate lines.
