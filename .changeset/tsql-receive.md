---
"prettier-plugin-tsql": patch
---

Format `RECEIVE` — on its own and inside `WAITFOR (RECEIVE ...)`: the column list, `FROM queue`, `INTO @table` and `WHERE conversation_handle | conversation_group_id = ...` each on their own line, with `WAITFOR (...)` wrapping the indented `RECEIVE` and `TIMEOUT` following. `WAITFOR (RECEIVE ...)` was kept on one line however long it was.
