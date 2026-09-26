---
"prettier-plugin-tsql": patch
---

`UPDATE` / `DELETE ... WHERE CURRENT OF cursor` kept its `WHERE`: it was dropped, which turned a one-row change into one affecting every row.
