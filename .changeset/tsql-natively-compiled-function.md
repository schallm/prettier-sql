---
"prettier-plugin-tsql": patch
---

A natively compiled `CREATE FUNCTION`'s `BEGIN ATOMIC WITH (...)` body no longer gets wrapped in an extra `BEGIN ... END`, and its option names (`TRANSACTION ISOLATION LEVEL`, `LANGUAGE`, ...) are keyword-cased per `sqlKeywordCase` instead of always printing uppercase.
