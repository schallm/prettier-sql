import type { Plugin } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import { languages } from './language.js';
import { options } from '@prettier-sql/core/options';
import { parse, locStart, locEnd } from './parser/index.js';
import { printer } from './printer/index.js';

const plugin: Plugin<SqlNode> = {
    languages,
    parsers: {
        pgsql: {
            parse,
            astFormat: 'pgsql-ast',
            locStart,
            locEnd,
        },
    },
    printers: {
        'pgsql-ast': printer,
    },
    options,
};

export default plugin;
