---
"prettier-plugin-tsql": patch
---

Keep `PROPERTY(column, 'name')` in `CONTAINS`, `FREETEXT`, `CONTAINSTABLE` and `FREETEXTTABLE`. It printed as the bare column, which searches the whole column instead of one document property.
