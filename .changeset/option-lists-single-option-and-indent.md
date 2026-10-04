---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Wrap a `WITH (...)` / `OPTIONS (...)` list that holds a single option too long for the line (`SWITCH PARTITION ... WITH (WAIT_AT_LOW_PRIORITY (...))`), and indent the options of a `PRIMARY KEY` / `UNIQUE` constraint's `WITH (...)` under the constraint instead of at its own indentation.
