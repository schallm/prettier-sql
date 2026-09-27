---
"prettier-plugin-tsql": patch
---

`CREATE TRIGGER ... ON ALL SERVER ... FOR LOGON` keeps its `ALL SERVER` scope and `LOGON` event; both were dropped, producing unparseable output.
