---
"prettier-plugin-tsql": patch
---

`OPEN`, `FETCH`, `CLOSE` and `DEALLOCATE GLOBAL cursor` keep `GLOBAL` — without it a local cursor of the same name is used — and `DECLARE c INSENSITIVE SCROLL CURSOR` keeps its ISO form instead of becoming invalid.
