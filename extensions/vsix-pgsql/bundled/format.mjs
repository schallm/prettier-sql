import { runFormat } from '../../shared/format-core.mjs';
await runFormat({ callerUrl: import.meta.url, pluginName: 'prettier-plugin-pgsql', parser: 'pgsql' });
