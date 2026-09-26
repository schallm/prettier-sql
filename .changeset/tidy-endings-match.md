---
"prettier-plugin-tsql": patch
"prettier-plugin-postgresql": patch
---

- `sqlKeywordCase: "preserve"` now follows the input: an upper-case file keeps
  upper-case keywords and anything else is lower case. It previously behaved like
  `"upper"`.
- T-SQL output now ends with a newline, like PostgreSQL output and Prettier's own
  printers.
