---
"prettier-plugin-postgresql": patch
---

Keep the subscripts and field names of INSERT and UPDATE targets (`set a[1] = 2`, `insert into t (a.b)`), the `UNLOGGED` of `SELECT ... INTO UNLOGGED`, and `OVERRIDING ... VALUE` in `MERGE ... INSERT`, instead of silently dropping them.
