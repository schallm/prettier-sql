# Getting Started

## Requirements

| Requirement  | Version | Notes                                    |
| ------------ | ------- | ---------------------------------------- |
| Node.js      | 20+     | Node 18 is EOL                           |
| .NET Runtime | 8.0+    | SDK only needed for building from source |
| Prettier     | 3.x     |                                          |

## Installing from npm

```bash
npm install --save-dev prettier-plugin-tsql prettier
```

The npm package includes the compiled .NET DLL (`bin/dotnet/SqlScriptDom.dll`). No separate .NET build step is needed.

## Basic Configuration

Create or update your Prettier config to include the plugin:

```js
// prettier.config.js
export default {
    plugins: ['prettier-plugin-tsql'],
};
```

The plugin registers itself for `.sql` and `.tsql` files automatically.

## VS Code

Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension. Once the plugin is installed and configured, formatting `.sql` files with Prettier will use this plugin automatically.

To format on save, add to your VS Code settings:

```json
{
    "editor.formatOnSave": true,
    "[sql]": {
        "editor.defaultFormatter": "esbenp.prettier-vscode"
    }
}
```

## SQL Server Management Studio 22 (Visual Studio 2026)

SSMS 22 is built on the Visual Studio 2026 shell and supports third-party extensions
(unofficially — no marketplace yet, but extensions are not blocked). The
[PrettierX64](https://marketplace.visualstudio.com/items?itemName=vs-publisher-126251.PrettierX64)
extension brings Prettier formatting to Visual Studio 2022 and 2026, and can load custom
plugins including `prettier-plugin-tsql`.

> **Node.js is required.** Prettier is a Node.js library and must be invoked via a `node`
> process. npm and a project are _not_ required — see setup below.

> **Experimental** — this integration has not been formally tested. Plugin loading and
> `.sql` file triggering depend on PrettierX64 internals that are not fully documented.
> See [Limitations](#limitations) below before relying on it.

### How PrettierX64 finds Prettier

PrettierX64 walks **up the directory tree from the file being formatted** looking for a
`node_modules/prettier` installation. If it finds one it uses it — including any plugins
configured in `prettier.config.js` alongside it. If it finds nothing it falls back to its
own bundled copy of Prettier, which will not have `prettier-plugin-tsql`.

### Setup

**1. Install Node.js** (20+) from [nodejs.org](https://nodejs.org) if not already present.

**2. Install prettier and the plugin** into your Windows user profile directory so they
are reachable from any file saved under `C:\Users\<you>\`:

```powershell
cd $env:USERPROFILE
npm install prettier prettier-plugin-tsql
```

**3. Create a `prettier.config.js`** in `%USERPROFILE%`:

```js
// C:\Users\<you>\prettier.config.js
export default {
    plugins: ['prettier-plugin-tsql'],
    sqlKeywordCase: 'lower',
};
```

**4. Install PrettierX64** from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=vs-publisher-126251.PrettierX64)
and restart SSMS.

**5. Format a SQL file** with **Ctrl+K, Ctrl+J** (or right-click → Format with Prettier).

### Limitations

| Limitation                     | Detail                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsaved query windows          | SSMS assigns temp file paths outside `%USERPROFILE%` to unsaved tabs, so PrettierX64 won't find the config. **Save the file first** (`Ctrl+S`) to a location under `Documents\`. |
| SSMS compatibility unconfirmed | PrettierX64 targets VS 2022/2026 but has not been tested inside SSMS 22 specifically. Microsoft marks third-party SSMS extensions as unsupported.                                |
| `.sql` file detection          | SQL is not a default Prettier file type. Detection relies on `prettier-plugin-tsql` registering the `.sql` extension and PrettierX64 passing the filename to Prettier's API.     |
| .NET DLL loading               | `prettier-plugin-tsql` loads a native .NET assembly at runtime via `node-api-dotnet`. Behavior inside the Visual Studio process (which is itself a .NET host) is untested.       |

### Troubleshooting

Open **View → Output** and select **"Prettier x64"** from the dropdown to see which
Prettier installation and config file PrettierX64 is using. If the output shows the
bundled version rather than your local install, the `node_modules` folder was not found
on the path from your file up to `%USERPROFILE%`.

---

## Building from Source

If you want to contribute or use a local build:

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

### Steps

```bash
# 1. Clone and install Node dependencies
git clone https://github.com/schallm/prettier-plugin-tsql.git
cd prettier-plugin-tsql
npm install

# 2. Build the C# parser DLL
npm run build:dotnet

# 3. Compile TypeScript
npm run build:ts

# Or do both at once:
npm run build

# 4. Run tests
npm test
```

### Build Scripts

| Script                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `npm run build`          | Full build (C# + TypeScript)                       |
| `npm run build:dotnet`   | Compile C# project → `bin/dotnet/SqlScriptDom.dll` |
| `npm run build:ts`       | Compile TypeScript → `dist/`                       |
| `npm run build:ts:watch` | TypeScript watch mode                              |
| `npm test`               | Run all tests                                      |
| `npm run test:watch`     | Vitest watch mode                                  |

### Using a Local Build

Point your Prettier config at the local `dist/index.js`:

```js
// prettier.config.js
export default {
    plugins: ['./path/to/prettier-plugin-tsql/dist/index.js'],
};
```

## Verifying the Setup

Create a test file `test.sql`:

<!-- prettier-ignore -->
```sql
SELECT Books.BookId,Books.Title,Books.Price,Authors.LastName FROM Books INNER JOIN Authors ON Books.AuthorId=Authors.Id WHERE Books.InStock=1 ORDER BY Books.Title ASC;
```

Run Prettier:

```bash
npx prettier --write test.sql
```

Expected output:

```sql
select
    Books.BookId,
    Books.Title,
    Books.Price,
    Authors.LastName
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
where Books.InStock = 1
order by Books.Title asc;
```
