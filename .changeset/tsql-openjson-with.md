---
"prettier-plugin-tsql": patch
---

Format the columns of `OPENJSON ... WITH (...)` and `OPENXML ... WITH (...)`: their types and `AS JSON` take the keyword case, and a comment after a column stays with it instead of moving after the statement.
