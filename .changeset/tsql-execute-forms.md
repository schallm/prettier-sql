---
"prettier-plugin-tsql": patch
---

`EXECUTE` keeps everything it was written with: `AS USER` / `AS LOGIN = 'name'`, pass-through parameters for `EXECUTE ('...', 1) AT server`, a bracketed linked-server name, a procedure number (`dbo.p;2`), and `WITH RESULT SETS` — which was found by searching the text, so a string containing those words produced broken output.
