// Copies the platform-specific libpg_query native library into bin/dotnet/
// so .NET can resolve it via standard DllImport probing (same directory as PgScriptDom.dll).
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const root = join(fileURLToPath(import.meta.url), '../../');
const binDir = join(root, 'bin/dotnet');
const runtimesDir = join(binDir, 'runtimes');

function rid() {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
    if (process.platform === 'darwin') return `osx-${arch}`;
    if (process.platform === 'linux') return `linux-${arch}`;
    if (process.platform === 'win32') return `win-x64`;
    throw new Error(`Unsupported platform: ${process.platform}`);
}

const ext = process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';
const libName = process.platform === 'win32' ? 'libpg_query.dll' : `libpg_query.${ext}`;

const src = join(runtimesDir, rid(), 'native', libName);
const dst = join(binDir, libName);

if (!existsSync(src)) {
    console.error(`Native library not found: ${src}`);
    process.exit(1);
}

copyFileSync(src, dst);
console.log(`Copied ${libName} → bin/dotnet/`);
