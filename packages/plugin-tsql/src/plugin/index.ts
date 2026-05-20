import type { Plugin } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import { languages } from './language.js';
import { options } from '@prettier-sql/core/options';
import { parse, locStart, locEnd } from './parser/index.js';
import { printer } from './printer/index.js';

const plugin: Plugin<SqlNode> = {
    languages,
    parsers: {
        tsql: {
            parse,
            astFormat: 'tsql-ast',
            locStart,
            locEnd,
        },
    },
    printers: {
        'tsql-ast': printer,
    },
    options,
};

export default plugin;
