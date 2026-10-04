---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Wrap a long chain that mixes `+` and `-` like a chain of one operator: terms fill each line, continuation lines are indented and start with their operator. `a + b * c - d` stopped wrapping after the first `+`, leaving a long second line.
