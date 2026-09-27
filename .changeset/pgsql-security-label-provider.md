---
"prettier-plugin-postgresql": patch
---

Keep `SECURITY LABEL ON ...` without a `FOR provider` clause parseable, instead of printing an empty `FOR`.
