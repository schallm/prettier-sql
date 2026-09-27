---
"prettier-plugin-postgresql": patch
---

`CREATE SUBSCRIPTION ... WITH (...)` keeps its options; they were silently dropped.
