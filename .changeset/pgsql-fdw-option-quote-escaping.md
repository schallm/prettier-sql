---
"prettier-plugin-postgresql": patch
---

An FDW option value (`OPTIONS (...)` on a foreign server, table, or column) with an embedded `'` no longer prints unescaped, which didn't parse.
