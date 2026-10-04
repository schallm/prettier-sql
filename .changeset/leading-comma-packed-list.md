---
"prettier-plugin-postgresql": patch
---

With `sqlCommaStyle: "leading"`, a packed list that fits on one line (`UPDATE ... SET a = 1, b = 2`, multi-row `VALUES`) no longer prints a space before each comma.
