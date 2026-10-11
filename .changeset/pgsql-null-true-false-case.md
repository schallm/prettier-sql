---
"prettier-plugin-postgresql": patch
---

Apply `sqlKeywordCase` to the constants `NULL`, `TRUE` and `FALSE`, as the T-SQL plugin does; they always printed in lower case.
