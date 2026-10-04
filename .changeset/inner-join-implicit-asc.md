---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": minor
---

Print the same keywords for the same SQL in both dialects: an inner join prints as `INNER JOIN` in PostgreSQL (as in T-SQL), and T-SQL no longer adds `ASC` to an `ORDER BY` item or index column that didn't have one (as in PostgreSQL). An `ASC` written in the source is kept.
