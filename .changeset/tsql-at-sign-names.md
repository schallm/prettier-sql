---
"prettier-plugin-tsql": patch
---

Keep the brackets on a name that starts with `@` (`[@@SCHEMA_NAME@@].[@@OBJECT_NAME@@]`, `[@col]`), which is a variable without them, and on a name `go`, which alone on a line is a batch separator.
