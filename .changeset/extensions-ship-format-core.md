---
"prettier-sql": patch
"prettier-tsql-vsix": patch
"prettier-pgsql-vsix": patch
---

Ship the formatter's shared module inside each extension. The packaged extensions imported it from outside their own folder, so once installed every format failed with "Cannot find module .../shared/format-core.mjs".
