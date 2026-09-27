---
"prettier-plugin-postgresql": patch
---

`XMLPARSE(... PRESERVE WHITESPACE)` no longer drops the `PRESERVE WHITESPACE` option, which changed the expression's meaning.
