---
"prettier-plugin-postgresql": patch
---

Several printers built a `'...'` string literal from raw text without doubling an embedded `'`, producing unparseable output: `CREATE EXTENSION ... VERSION`, `COMMIT/ROLLBACK PREPARED`'s transaction id, `COPY ... TO`/`TO PROGRAM`'s filename, `NOTIFY`'s payload, `LOAD`'s filename, `CREATE TABLESPACE ... LOCATION`, and `SECURITY LABEL ... IS`.
