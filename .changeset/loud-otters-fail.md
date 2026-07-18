---
"prettier-plugin-postgresql": patch
---

Fail loudly with a clear error instead of silently dropping SQL when the formatter hits an
unsupported expression, FROM item, or constant kind (e.g. `COLLATE`, `IS JSON`, bit-string
literals). Previously these cases either emitted an unhelpful `/* unknown: RawExpr */` marker
or, for unrecognized constant kinds, vanished from the output entirely with no indication
anything was wrong. The error message now names the specific unsupported construct and shows
the surrounding source text.
