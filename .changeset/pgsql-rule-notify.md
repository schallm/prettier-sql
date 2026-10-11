---
"prettier-plugin-postgresql": patch
---

Keep NOTIFY actions of `CREATE RULE`; a rule with several actions lost every NOTIFY.
