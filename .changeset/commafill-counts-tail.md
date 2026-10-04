---
"prettier-plugin-postgresql": patch
---

Count the closing `;` when filling the names of a `DROP` or `TRUNCATE` several to a line, so the last line can no longer end one column past `printWidth`.
