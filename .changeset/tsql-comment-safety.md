---
"prettier-plugin-tsql": patch
---

Stop a line comment from swallowing the code after it: a comment after an `IF` condition (or before the statement it guards), or in a function's header, was printed on the same line as the code that followed it, which commented that code out. Comments inside `WITH (...)` option lists, column definitions, `CREATE TABLE ... AS SELECT` and other statements printed from source text are no longer repeated or dropped, a comment between a DBCC keyword and its command or between `=` and an `ALTER DATABASE ... SET` value no longer garbles the statement, and a comment that nothing else printed is kept after its statement.
