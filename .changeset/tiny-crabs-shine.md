---
"prettier-plugin-tsql": minor
---

Add support for `CREATE/ALTER/DROP EXTERNAL MODEL` (SQL Server 2025's AI functions
feature for registering external AI models like Azure OpenAI embeddings endpoints) —
previously entirely unhandled (raw-text passthrough), now parsed and reformatted
structurally.
