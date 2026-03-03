import type { Plugin } from 'prettier';
import type { SqlNode } from './parser/types.js';
import { languages } from './language.js';
import { options } from './options.js';
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
