---
"prettier-plugin-tsql": patch
---

`SET @x.modify(...)` keeps the method name's case with `sqlKeywordCase: "upper"`: xml and CLR type methods are case-sensitive, so `@x.MODIFY(...)` failed to run.
