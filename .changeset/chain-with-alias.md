---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Count a select item's `AS alias` when wrapping a `+` / `-` / `||` chain, so the line holding the last term and the alias no longer runs past `printWidth`.
