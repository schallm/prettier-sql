import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface DotnetHandle {
    load(dllPath: string): void;
    [key: string]: unknown;
}

/**
 * Loads a .NET DLL via node-api-dotnet using require() resolved from the caller's location.
 *
 * @param callerUrl   — import.meta.url of the calling parser/index.ts (compiled or source)
 * @param dllName     — filename of the DLL, e.g. 'SqlScriptDom.dll'
 * @param pluginName  — plugin package name used in error messages, e.g. 'prettier-plugin-tsql'
 */
export function loadDotnetDll(callerUrl: string, dllName: string, pluginName: string): DotnetHandle {
    ensureDotnetRoot();
    const require = createRequire(callerUrl);
    const dotnet = require('node-api-dotnet') as DotnetHandle;

    const thisDir = path.dirname(fileURLToPath(callerUrl));
    const isCompiled = thisDir.endsWith(path.join('dist', 'parser')) || thisDir.endsWith('dist/parser');
    const dllPath = isCompiled
        ? path.resolve(thisDir, `../../bin/dotnet/${dllName}`)
        : path.resolve(thisDir, `../../../bin/dotnet/${dllName}`);

    try {
        dotnet.load(dllPath);
    } catch (e) {
        throw new Error(
            `${pluginName}: failed to load ${dllName} from "${dllPath}". ` +
                `Make sure .NET 8+ is installed and the package was installed correctly. ` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    return dotnet;
}

/**
 * node-api-dotnet finds .NET through DOTNET_ROOT or the installer's default location
 * (/usr/local/share/dotnet, C:\Program Files\dotnet, ...), so a .NET installed elsewhere —
 * Homebrew, mise, asdf, a snap — wasn't found though `dotnet` runs fine. Without DOTNET_ROOT,
 * use the folder of the `dotnet` on PATH (following symlinks), when it holds a .NET host.
 */
function ensureDotnetRoot(): void {
    if (process.env['DOTNET_ROOT']) return;
    const exe = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
    for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
        if (!dir) continue;
        let real: string;
        try {
            real = fs.realpathSync(path.join(dir, exe));
        } catch {
            continue;
        }
        const root = path.dirname(real);
        if (fs.existsSync(path.join(root, 'host', 'fxr'))) {
            process.env['DOTNET_ROOT'] = root;
            return;
        }
    }
}
