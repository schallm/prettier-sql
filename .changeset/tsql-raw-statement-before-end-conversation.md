---
"prettier-plugin-tsql": patch
---

Stop a statement that is kept as written (such as `CREATE DATABASE` or `BACKUP`) before a following `END CONVERSATION`. It swallowed the `END CONVERSATION` keywords, so the output had a stray `END CONVERSATION;` ahead of the real statement.
