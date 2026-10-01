---
"prettier-plugin-postgresql": patch
---

Keep argument modes and names in function and aggregate signatures of `DROP`, `ALTER`, `COMMENT` and `GRANT` (`DROP FUNCTION f(IN a int, OUT b text)`, `DROP PROCEDURE p(INOUT x int)`, `VARIADIC`), which were reduced to bare input types.
