---
"prettier-plugin-tsql": patch
---

`WITH INLINE = OFF` on a function stays `OFF`; it printed as `INLINE`, which turns scalar UDF inlining on.
