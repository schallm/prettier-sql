---
"prettier-plugin-tsql": patch
---

Format Azure SQL's `ALTER DATABASE ... MODIFY (EDITION = ..., SERVICE_OBJECTIVE = ...)` and keep its `WITH MANUAL_CUTOVER`. It printed as `ALTER DATABASE ... SET SERVICE_OBJECTIVE = ...`, which does not parse.
