# Getting Started

## Requirements

| Requirement | Version |
| ----------- | ------- |
| Node.js     | 18+     |
| .NET SDK    | 8.0     |
| Prettier    | 3.x     |

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
  plugins: ["prettier-plugin-tsql"],
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

## Building from Source

If you want to contribute or use a local build:

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

### Steps

```bash
# 1. Clone and install Node dependencies
git clone <repo-url>
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
  plugins: ["./path/to/prettier-plugin-tsql/dist/index.js"],
};
```

## Verifying the Setup

Create a test file `test.sql`:

```sql
SELECT b.BookId,b.Title,b.Price FROM Books AS b INNER JOIN Authors AS a ON b.AuthorId=a.Id WHERE b.InStock=1 ORDER BY b.Title ASC;
```

Run Prettier:

```bash
npx prettier --write test.sql
```

Expected output:

```sql
select
  b.BookId,
  b.Title,
  b.Price
from
  Books as b
  inner join Authors as a on b.AuthorId = a.Id
where b.InStock = 1
order by b.Title asc;
```
