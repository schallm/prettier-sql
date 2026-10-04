---
"prettier-plugin-tsql": patch
---

Apply the keyword case to `AS` and `DEFAULT` in `WITH XMLNAMESPACES`, and keep a quote inside a namespace URI doubled (`'urn:it''s'`). It printed as a single quote, which does not parse.
