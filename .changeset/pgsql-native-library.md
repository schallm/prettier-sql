---
"prettier-plugin-postgresql": patch
"prettier-sql": patch
---

Load libpg_query for the platform the plugin runs on. The published package only worked on Linux: on macOS and Windows every format failed with "Unable to load shared library 'libpg_query'".
