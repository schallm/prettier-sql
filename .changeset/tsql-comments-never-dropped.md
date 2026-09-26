---
"prettier-plugin-tsql": patch
---

Comments inside a statement are no longer dropped. A comment after the last select item, a table name, a join condition, a column definition, a CTE body or a `UNION` disappeared; every comment is now printed where it was, or at worst right after its statement. Line comments in fill-packed lists (`UPDATE ... SET`, compact lists) also end their line, instead of swallowing the items that followed.
