---
"prettier-plugin-tsql": patch
---

Fix a non-idempotent trailing comment on `ORDER BY`: once `ASC` is spelled out on reformat, the comment attaches to the `ORDER BY` element instead of its sort expression, and used to be dropped.
