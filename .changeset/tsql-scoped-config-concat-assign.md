---
"prettier-plugin-tsql": patch
---

Keep `ALTER DATABASE SCOPED CONFIGURATION SET` options that ScriptDom doesn't know, such as `OPTIMIZED_PLAN_FORCING = ON`, which printed as `SET ALTER`; and print `SET @s ||= ...` instead of `SET @s ConcatEquals ...`.
