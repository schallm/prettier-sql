---
"prettier-plugin-tsql": patch
---

Keep `FETCH NEXT n ROWS ONLY` when it has no `OFFSET` — the row limit was dropped — and keep `APPROXIMATE` in `FETCH APPROXIMATE` and `TOP (n) WITH APPROXIMATE` (SQL Server 2025).
