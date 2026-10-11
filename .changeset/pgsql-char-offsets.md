---
"prettier-plugin-postgresql": patch
---

Report statement positions (`locStart` / `locEnd`) in characters, as Prettier counts them, not in UTF-8 bytes, and start each statement at its first token rather than just after the previous semicolon.
