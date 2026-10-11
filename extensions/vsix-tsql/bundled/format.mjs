import { existsSync } from 'fs';

// Packaged, format-core.mjs sits beside this file (the packaging copies it in); in the
// repository it is shared by the extensions. The extension's own folder is all it ships.
const core = existsSync(new URL('./format-core.mjs', import.meta.url)) ? './format-core.mjs' : '../../shared/format-core.mjs';
const { runFormat } = await import(core);
await runFormat({ callerUrl: import.meta.url, pluginName: 'prettier-plugin-tsql', parser: 'tsql' });
