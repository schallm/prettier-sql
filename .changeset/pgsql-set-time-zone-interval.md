---
"prettier-plugin-postgresql": patch
---

Keep the interval of `SET TIME ZONE INTERVAL '1' HOUR TO MINUTE` instead of turning it into the plain string `'1'`.
