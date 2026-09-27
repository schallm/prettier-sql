---
"prettier-plugin-postgresql": patch
---

A `VALUES` query keeps its `WITH` clause (`WITH c AS (...) VALUES (...)`); the CTEs were dropped.
