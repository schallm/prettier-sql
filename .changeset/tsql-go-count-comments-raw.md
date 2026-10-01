---
"prettier-plugin-tsql": patch
---

Handle `GO 5` (a batch repeat count): it used to be a parse error. A script with only comments, or only GO lines, was printed empty, dropping the comments; it is now kept as written. Statements printed from their source text no longer repeat a comment written inside them, `ALTER DATABASE SCOPED CONFIGURATION ... SET` no longer swallows the text up to the next semicolon (a following statement without one was duplicated, and a trailing comment ended up before the semicolon), a line comment after a comment on the same statement no longer runs into it, and a comment on its own line after the last statement stays on its own line.
