# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prettier PostgreSQL is a Visual Studio extension (VSIX) that formats PostgreSQL SQL files using Prettier. It bridges the .NET-based VS extension API with the Node.js Prettier ecosystem by spawning a Node.js child process for formatting.

## Build Commands

> **Windows only.** The project targets `net48` (.NET Framework 4.8) and uses `Microsoft.VSSDK.BuildTools` for VSIX packaging — neither has cross-platform support. Builds must run on Windows with the Visual Studio SDK installed.

```bash
# Install Node dependencies (required before building)
cd bundled && npm install

# Build the VSIX — must be two separate steps so NuGet restore creates
# the generated props file that sets VSToolsPath before the build reads it
msbuild src/PrettierPgsql.slnx /t:Restore
msbuild src/PrettierPgsql.slnx /p:Configuration=Release /p:DeployExtension=false /t:Build

# Run Node tests (cross-platform)
npm test

# Generate third-party notices (runs automatically as a pre-build step)
node scripts/generate-notices.mjs
```

## Architecture

The project has two runtimes that communicate via stdin/stdout:

**C# side** (`src/PrettierPgsql/`):

- `PrettierPgsqlPackage.cs` — AsyncPackage entry point; auto-loads when a `.sql`/`.pgsql` file opens
- `FormatCommand.cs` — Handles `Ctrl+K, Ctrl+J`; reads editor text, calls `NodeRunner`, replaces buffer
- `NodeRunner.cs` — Spawns `node bundled/format.mjs`, pipes SQL via stdin, reads formatted SQL from stdout

**Node.js side** (`bundled/`):

- `format.mjs` — Reads SQL from stdin, calls `prettier.format()` with `prettier-plugin-pgsql`, writes to stdout
- Exit codes: `0` = success, `1` = formatting error, `2` = parse/usage error

**Flow:** User triggers command → `FormatCommand` extracts SQL text → `NodeRunner` spawns Node process → `format.mjs` formats via Prettier → result replaces editor buffer.

## Key Details

- **Target frameworks**: .NET 4.8 (for VS/SSMS compatibility); Node.js 20+ (system PATH or VS-bundled)
- **Node discovery**: `NodeRunner` tries system PATH first, then VS's bundled Node.js
- **Bundled dependencies**: All `node_modules` are bundled in the VSIX so end users don't need to run `npm install`
- **Default formatter options**: `parser: pgsql`, `printWidth: 120`, `tabWidth: 4`
- **Threading**: All VS API calls must use `ThreadHelper.JoinableTaskFactory` and check `ThreadHelper.ThrowIfNotOnUIThread()`
- **Code style**: File-scoped namespaces, nullable reference types enabled, `var` preferred, 1TBS braces (see `.editorconfig`)
