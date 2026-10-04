---
"prettier-plugin-tsql": patch
---

In `CREATE DATABASE`, keep the case of a bracketed filegroup name with a space in it (`FILEGROUP [Archive Data]` printed as `[Archive data]` with lowercase keywords), and print `CONTAINS FILESTREAM` / `CONTAINS MEMORY_OPTIMIZED_DATA` before `DEFAULT`, the only order that parses.
