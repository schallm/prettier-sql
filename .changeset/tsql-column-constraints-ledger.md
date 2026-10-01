---
"prettier-plugin-tsql": patch
---

Stop garbling or dropping parts of table definitions: ledger and `SUSER_SID`/`SUSER_SNAME` `GENERATED ALWAYS AS` columns printed with a space instead of an underscore (`transaction id`), `NOT FOR REPLICATION` on an inline `REFERENCES` or `CHECK` was dropped, `WITH CHECK`/`WITH NOCHECK` before `ALTER TABLE ... CHECK CONSTRAINT` was dropped, and column constraints written in an unusual order (such as `UNIQUE` before `NOT NULL`) were reordered; such columns are now kept as written.
