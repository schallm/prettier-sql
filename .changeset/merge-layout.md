---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": minor
---

Lay out `MERGE` the same way in both dialects: `ON` starts a line of its own after `USING` (PostgreSQL), `UPDATE SET` lays out its assignments as `UPDATE ... SET` does — a single one on the `SET` line, several packed (T-SQL, for one) — and in compact density the action stays on the `THEN` line (T-SQL).
