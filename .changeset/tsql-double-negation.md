---
"prettier-plugin-tsql": patch
---

A double negation such as `- -a` printed as `--a`, which starts a comment and drops the rest of the line; it now prints `- -a`.
