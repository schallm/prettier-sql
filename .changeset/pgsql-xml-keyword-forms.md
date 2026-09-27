---
"prettier-plugin-postgresql": patch
---

`XMLPARSE`, `XMLROOT`, and `XMLSERIALIZE` now print their SQL keyword forms (`XMLPARSE(DOCUMENT ...)`, `XMLROOT(x, VERSION ..., STANDALONE ...)`, `XMLSERIALIZE(DOCUMENT ... AS type)`) instead of unparseable positional-argument calls; `XMLSERIALIZE` was previously unsupported.
