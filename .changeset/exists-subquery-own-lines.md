---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Put the subquery of an `EXISTS` on its own lines, formatted like any other `SELECT`, in standard and spacious density (`compact` keeps a short one inline). In T-SQL, `IF EXISTS (...)` and `WHILE EXISTS (...)` no longer indent the subquery an extra level.
