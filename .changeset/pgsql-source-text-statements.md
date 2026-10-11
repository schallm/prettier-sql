---
"prettier-plugin-postgresql": patch
---

Fix statements kept as their source text (such as `ALTER ROLE ... SET` and `ALTER DEFAULT PRIVILEGES`): after non-ASCII text earlier in the file they were replaced by a `/* unknown statement */` placeholder or cut at the wrong place, the comments around them were printed twice, and a line comment at the end swallowed the semicolon.
