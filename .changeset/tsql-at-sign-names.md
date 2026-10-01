---
"prettier-plugin-tsql": patch
---

Keep the brackets on a name that starts with `@` (`[@@SCHEMA_NAME@@].[@@OBJECT_NAME@@]`, `[@col]`): without them it is a variable, not an identifier.
