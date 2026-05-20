import { runFormat } from '../../shared/format-core.mjs';
await runFormat({ callerUrl: import.meta.url, pluginName: 'prettier-plugin-tsql', parser: 'tsql' });
