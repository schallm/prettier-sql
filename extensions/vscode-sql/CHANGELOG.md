# prettier-sql

## 0.1.2

### Patch Changes

- 76e8893: Ship the formatter's shared module inside each extension. The packaged extensions imported it from outside their own folder, so once installed every format failed with "Cannot find module .../shared/format-core.mjs".
- a93cd16: Load libpg_query for the platform the plugin runs on. The published package only worked on Linux: on macOS and Windows every format failed with "Unable to load shared library 'libpg_query'".
- 4a3fb3a: Activate on `.sql` files. The extension only activated for `.tsql` / `.pgsql` files (or its command), so in a workspace of `.sql` files Format Document did nothing.
- bcc834a: Make Format Selection work: it formats the statements the selection or cursor touches and leaves the rest of the file as it was. Prettier's own range formatting does nothing for a plugin language, so it changed nothing.
- b6a6c3d: A project's `.prettierrc` now takes precedence over the extension's settings, as documented; the settings (even ones left at their defaults) overrode it. The .NET runtime check no longer warns when an older runtime is installed alongside .NET 8 or later.
- ab95b30: Keep a file's own line endings (CRLF in most Windows projects); formatting turned them into LF.
- 2010321: Format with the bundled plugin even when the project's `.prettierrc` lists `plugins` (as the plugins' READMEs suggest); formatting failed with "Cannot find package".

## 0.1.1

### Patch Changes

- Fix several compact formatting issues
