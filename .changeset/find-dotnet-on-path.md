---
"prettier-plugin-tsql": patch
"prettier-plugin-postgresql": patch
---

Find a .NET installed outside the default location (Homebrew, mise, asdf, a snap) through the `dotnet` on `PATH`; the plugins failed with ".NET installation not found" unless `DOTNET_ROOT` was set.
