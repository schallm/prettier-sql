---
"prettier-sql": patch
---

A project's `.prettierrc` now takes precedence over the extension's settings, as documented; the settings (even ones left at their defaults) overrode it. The .NET runtime check no longer warns when an older runtime is installed alongside .NET 8 or later.
