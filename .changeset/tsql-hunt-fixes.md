---
"prettier-plugin-tsql": patch
---

Fixes found by formatting Microsoft's ScriptDom test scripts:

- `OPTION (BYPASS OPTIMIZER_QUEUE)` and `OPTION (OPTIMIZE CORRELATED UNION ALL)` no longer fail to format.
