---
"prettier-plugin-tsql": patch
---

Keep the case of identifiers the formatter used to upper-case with `sqlKeywordCase: upper`: xml schema collections in `xml(dbo.Sc)` types (parameters, `ALTER COLUMN`, `CAST`, function return types), user-defined function return types, and logical `BACKUP`/`RESTORE` device names. `DECLARE @x xml(dbo.Sc)` no longer drops its schema collection, and `BACKUP` options `EXPIREDATE`, `RETAINDAYS`, `MEDIANAME`, `BLOCKSIZE`, `BUFFERCOUNT` and `MAXTRANSFERSIZE` print with their real keywords.
