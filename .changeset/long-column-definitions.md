---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Wrap a column definition that doesn't fit within `printWidth`: the name, type and collation stay together and each constraint or clause (`NOT NULL`, `DEFAULT`, `CONSTRAINT ... PRIMARY KEY`, `REFERENCES ... ON DELETE`, `CHECK`, `IDENTITY`, `ENCRYPTED WITH`) goes on its own indented line. A column that fits stays on one line.
