---
"prettier-plugin-tsql": patch
---

Fix `<<` and `>>` printing as `LeftShift`/`RightShift`, and a column alias written as a string with a space (`AS 'two words'`) printing without quotes, which turned it into invalid SQL. `SELECT ALL a` and `COUNT(ALL a)` drop the redundant `ALL`.
