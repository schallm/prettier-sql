---
"prettier-plugin-tsql": patch
---

Write the size of a built-in type as `(10, 2)` wherever it appears (`ALTER COLUMN`, `CAST`, `DECLARE`, parameters), as a column definition already did, instead of keeping the input's spacing.
