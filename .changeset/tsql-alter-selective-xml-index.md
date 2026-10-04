---
"prettier-plugin-tsql": patch
---

Format `ALTER INDEX ... FOR (ADD ..., REMOVE ...)` on a selective XML index, with its `WITH XMLNAMESPACES`. It printed as `ALTER INDEX ... UPDATESELECTIVEXMLPATHS`, which does not parse.
