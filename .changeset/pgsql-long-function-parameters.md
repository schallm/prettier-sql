---
"prettier-plugin-postgresql": patch
---

Break the parameter list of `CREATE FUNCTION` / `CREATE PROCEDURE`, and the column list of `RETURNS TABLE (...)`, one per line when it doesn't fit within `printWidth`.
