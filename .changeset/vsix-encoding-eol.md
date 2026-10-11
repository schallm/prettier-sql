---
"prettier-tsql-vsix": patch
"prettier-pgsql-vsix": patch
---

Keep non-ASCII text intact (the SQL went to and from the formatter in the console's code page, not UTF-8), keep a file's CRLF line endings, and don't apply a format result to a document edited while it ran.
