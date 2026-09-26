---
"prettier-plugin-tsql": patch
---

Transaction statements keep everything they were written with: names and savepoints given as variables (`ROLLBACK TRAN @savepoint` had become a full `ROLLBACK`), `COMMIT ... WITH (DELAYED_DURABILITY = ON)`, and `WITH MARK` descriptions that are variables or contain quotes.
