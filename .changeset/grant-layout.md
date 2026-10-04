---
"prettier-plugin-postgresql": minor
"prettier-plugin-tsql": patch
---

Lay out `GRANT` / `REVOKE` the same way in both dialects: `ON …` goes on a line of its own like `TO` / `FROM` (T-SQL), and a long privilege list packs onto indented lines below the verb (PostgreSQL).
