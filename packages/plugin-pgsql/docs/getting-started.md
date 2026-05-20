# Getting Started

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| .NET Runtime | 8.0 or later |
| Prettier | 3.x |

The plugin embeds a compiled C# layer that calls the PostgreSQL parser (libpg_query) via a native shared library. The .NET 8 runtime must be installed on the machine that runs Prettier — it is **not** bundled inside the npm package.

Download .NET 8: <https://dotnet.microsoft.com/download/dotnet/8.0>

---

## Installation

```sh
npm install --save-dev prettier prettier-plugin-pgsql
```

### Basic configuration

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-pgsql'],
  overrides: [
    {
      files: ['*.sql', '*.pgsql'],
      options: {
        parser: 'pgsql',
      },
    },
  ],
};
```

### VS Code

1. Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Add to `.vscode/settings.json`:

```json
{
  "[sql]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

---

## Verification

After installation, format a test file to confirm the plugin is working:

```sh
echo "SELECT id,title FROM books WHERE price<50 ORDER BY price;" | npx prettier --parser pgsql
```

Expected output:

```sql
select
  id,
  title
from books
where price < 50
order by price;
```

---

## Building from Source

```sh
git clone https://github.com/your-org/prettier-plugin-pgsql
cd prettier-plugin-pgsql
npm install
npm run build
npm test
```

### Build scripts

| Script | Description |
|---|---|
| `npm run build` | Full build: dotnet publish + copy native + tsc |
| `npm run build:dotnet` | C# layer only (dotnet msbuild + copy native lib) |
| `npm run build:ts` | TypeScript only (tsc) |
| `npm run build:ts:watch` | Watch mode for TypeScript |
| `npm test` | Run Vitest snapshot tests |
| `npm run test:watch` | Watch mode for tests |

The dotnet build step publishes `PgScriptDom.dll` and copies the platform-specific `libpg_query` native library into `bin/dotnet/` so the runtime can find it via DllImport probing.
