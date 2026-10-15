---
"prettier-plugin-postgresql": patch
---

Fixes found by formatting PostgreSQL's regression tests:

- A string holding a carriage return or another control character (other than a newline or tab) is written as an escape string, `E'a\rb'`. Written raw, the next format or an editor's line-ending normalization turned `\r` into a newline, changing the value.
