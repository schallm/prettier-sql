---
"prettier-plugin-tsql": patch
---

Keep the case of a user-defined type in `CREATE SEQUENCE ... AS` and of the group name in `ALTER DATABASE ... SET HADR AVAILABILITY GROUP = name`; both were keyword-cased.
