---
"prettier-sql": patch
---

Make Format Selection work: it formats the statements the selection or cursor touches and leaves the rest of the file as it was. Prettier's own range formatting does nothing for a plugin language, so it changed nothing.
