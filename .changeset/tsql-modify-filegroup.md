---
"prettier-plugin-tsql": patch
---

Keep `NAME = new_name` and `WITH ROLLBACK ...` / `WITH NO_WAIT` in `ALTER DATABASE ... MODIFY FILEGROUP`, and keep `READ_ONLY` / `READ_WRITE` as written instead of changing them to `READONLY` / `READWRITE`. A rename printed as `MODIFY FILEGROUP fg none`.
