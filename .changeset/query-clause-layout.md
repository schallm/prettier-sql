---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": minor
---

Lay out query clauses the same way in both dialects:

- A window specification stays on one line when it fits, e.g. `over (partition by a order by b)`, and its `ORDER BY` items pack like its `PARTITION BY` items (T-SQL).
- A single `WINDOW` definition and a `SELECT ... INTO` target stay on the keyword's line (PostgreSQL).
- In spacious density a single `FROM` table goes on its own line, like every other clause (PostgreSQL).
- In compact density joins stay on the `FROM` line when they fit (PostgreSQL), and a single select column no longer indents what follows it (T-SQL).
- `UPDATE ... FROM` a single table stays on the `FROM` line (T-SQL).
