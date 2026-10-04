import { registerPropertyCoverageTests } from '../../core/tests/property-coverage-harness.js';
import { unreadProperties } from '../src/plugin/parser/index.js';
import { unused, unreachable, dropped } from './unread-properties.js';

registerPropertyCoverageTests({
    unreadProperties,
    readProperty: 'SelectStmt.TargetList',
    listFile: 'tests/unread-properties.ts',
    unused,
    unreachable,
    dropped,
});
