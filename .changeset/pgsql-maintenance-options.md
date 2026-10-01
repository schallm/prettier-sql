---
"prettier-plugin-postgresql": patch
---

Keep the options, option values and target of `CLUSTER`, `REINDEX`, `VACUUM` and `ANALYZE`: `cluster verbose`, `cluster (verbose) t using i`, `reindex schema s`, `reindex database d`, `reindex system d`, `reindex (tablespace ts)`, and the case of quoted option values.
