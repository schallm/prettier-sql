---
"prettier-plugin-postgresql": patch
---

Format `CREATE DOMAIN`: on one line when it fits, otherwise `COLLATE`, `DEFAULT`, `NOT NULL` and each `CHECK` constraint on an indented line of their own, with a long `CHECK` condition wrapping like a table constraint. It used to be kept exactly as written.
