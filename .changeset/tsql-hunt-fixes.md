---
"prettier-plugin-tsql": patch
---

Fixes found by formatting Microsoft's ScriptDom test scripts:

- `OPTION (BYPASS OPTIMIZER_QUEUE)` and `OPTION (OPTIMIZE CORRELATED UNION ALL)` no longer fail to format.
- `OUTPUT … INTO @t` followed by a plain `OUTPUT …` keeps both clauses on `INSERT`, `UPDATE`, `DELETE` and `MERGE`; the plain `OUTPUT` was dropped.
- A `NULL` principal in `GRANT`, `DENY` and `REVOKE` (`TO public, null, u`) is kept; it printed as nothing, leaving `public, , u`.
