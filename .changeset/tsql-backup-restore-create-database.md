---
"prettier-plugin-tsql": patch
---

Format the `BACKUP`, `RESTORE` and `CREATE DATABASE` forms that were kept as written:

- `BACKUP` with `FILE` / `FILEGROUP` / `READ_WRITE_FILEGROUPS` lists, `MIRROR TO` clauses and `ENCRYPTION (ALGORITHM = ..., SERVER CERTIFICATE | SERVER ASYMMETRIC KEY = ...)`.
- `RESTORE` with `FILE` / `FILEGROUP` / `PAGE` lists, `FROM DATABASE_SNAPSHOT`, `STOPATMARK` / `STOPBEFOREMARK ... AFTER ...` and `FILESTREAM (DIRECTORY_NAME = ...)`.
- `CREATE DATABASE` with `CONTAINMENT`, `WITH` options (including Azure's parenthesized form), `FOR ATTACH` / `ATTACH_REBUILD_LOG`, and `AS SNAPSHOT OF` / `AS COPY OF` after file specs. Each file spec wraps one option per line when it doesn't fit, and a named filegroup keeps its `FILEGROUP` keyword.

A few rarer forms (an encryptor that isn't a server certificate or asymmetric key, a `FILESTREAM` restore option without a directory name, other attach modes) are still kept as written.
