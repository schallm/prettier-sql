import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import pgsqlPlugin from '../src/plugin/index.js';
import tsqlPlugin from '../../plugin-tsql/src/plugin/index.js';

// Both plugins load .NET assemblies into the same node-api-dotnet runtime, which
// exposes static classes by simple name. When both entry points were called
// SqlParser, whichever plugin parsed second found its parser undefined — so a
// Prettier config listing both plugins broke on one of the two dialects.
describe('both SQL plugins in one process', () => {
    const plugins = [pgsqlPlugin, tsqlPlugin];

    it('formats T-SQL then PostgreSQL', async () => {
        expect(await prettier.format('select a from b', { parser: 'tsql', plugins })).toContain('from b');
        expect(await prettier.format('select a from b', { parser: 'pgsql', plugins })).toContain('from b');
    });

    it('formats PostgreSQL then T-SQL', async () => {
        expect(await prettier.format('select 1', { parser: 'pgsql', plugins })).toContain('select 1');
        expect(await prettier.format('select 1', { parser: 'tsql', plugins })).toContain('select 1');
    });
});
