---
"prettier-plugin-tsql": patch
---

`WAITFOR (RECEIVE ...), TIMEOUT n` and `WAITFOR (GET CONVERSATION GROUP ...)` are kept; they printed as `waitfor delay ;`.
