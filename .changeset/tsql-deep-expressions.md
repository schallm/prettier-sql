---
"prettier-plugin-tsql": patch
---

Stop throwing on a long chain of `AND`, `OR`, `+` or `JOIN`: more than about 30 terms in one chain failed with "object depth is larger than the maximum allowed depth".
