---
"prettier-plugin-tsql": patch
---

Bracketed names containing `]` keep it escaped (`[a]]b]`); it was printed unescaped, which doesn't parse.
