---
"prettier-plugin-tsql": patch
---

A hash index's `BUCKET_COUNT` option kept its value but dropped the option name (`WITH (1024)`), which doesn't parse.
