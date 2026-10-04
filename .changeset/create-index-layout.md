---
"prettier-plugin-tsql": minor
---

Lay out `CREATE INDEX` as the PostgreSQL plugin does: `ON table (columns)` stays on the `CREATE INDEX` line when it fits, and `INCLUDE`, `WHERE`, `WITH`, `ON filegroup` and `FILESTREAM_ON` follow on the same line when they all fit, otherwise each on an indented line of its own.
