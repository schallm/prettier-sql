---
"prettier-plugin-tsql": patch
---

Keep parts of statements the formatter used to drop or garble: the `AS SELECT` and `WITH (...)` of `CREATE TABLE ... AS SELECT`, table `WITH` options with values (`DISTRIBUTION`, `CLUSTERED COLUMNSTORE INDEX`, `LEDGER`, `REMOTE_DATA_ARCHIVE`, `FILETABLE_*`), `AS FILETABLE`, `FEDERATED ON`, the `;number` of a numbered procedure, `AS EXTERNAL NAME` for CLR triggers and table-valued functions, the scope of `DROP TRIGGER ... ON DATABASE | ALL SERVER`, and the `FROM`/`WITH` clauses of `CREATE`/`ALTER EXTERNAL LANGUAGE | LIBRARY`.
