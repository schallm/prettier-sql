---
"prettier-plugin-tsql": patch
---

Keep the leading `::` of a system table function (`FROM ::fn_trace_getinfo(0)`), quote the quotes inside an `OPENQUERY` query string, and bracket a linked server name that needs it.
