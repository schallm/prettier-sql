---
"prettier-plugin-tsql": patch
---

`ALTER TABLE ... ADD` keeps `DEFAULT ... WITH VALUES` (which fills existing rows), `PERIOD FOR SYSTEM_TIME (...)` (it printed `add ;`) and `INDEX` definitions; a masking function containing a quote is escaped.
