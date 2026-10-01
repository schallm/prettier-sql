---
"prettier-plugin-postgresql": patch
---

Keep the `OF type` and `WITH OPTIONS` of typed tables, the `STORAGE` and `COMPRESSION` column clauses, and `IF NOT EXISTS` on `CREATE FOREIGN TABLE`, instead of silently dropping them.
