---
"prettier-plugin-postgresql": patch
---

Break a `JSON_QUERY` / `JSON_VALUE` call that doesn't fit within `printWidth`: the context and path stay together on the first line and `PASSING`, `RETURNING`, the wrapper and quotes options, and the `ON EMPTY` / `ON ERROR` behaviors each go on their own line.
