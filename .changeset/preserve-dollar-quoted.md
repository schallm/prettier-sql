---
"prettier-plugin-postgresql": patch
---

`sqlKeywordCase: preserve` no longer counts the keywords of a dollar-quoted function body, which is kept as written: an upper-case PL/pgSQL body turned a lower-case script upper case.
