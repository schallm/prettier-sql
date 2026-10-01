---
"prettier-plugin-postgresql": patch
---

Keep the `COLLATE` clause of `ALTER COLUMN ... TYPE`, instead of silently dropping it.
