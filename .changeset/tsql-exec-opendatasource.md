---
"prettier-plugin-tsql": patch
---

Keep `OPENDATASOURCE(...)` in `EXEC OPENDATASOURCE('provider', 'init').db.dbo.proc`. It was dropped, which turned the call into one to a local procedure.
