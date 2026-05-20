import type { AstPath, Doc, Printer } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import { printScript, printStatement } from './statements.js';
import { printExpression } from './expressions.js';

function getVisitorKeys(_node: SqlNode): string[] {
    return [];
}

const print = (path: AstPath<SqlNode>, options: object, _printChild: (path: AstPath<SqlNode>) => Doc): Doc => {
    const opts = options as Options;
    const node = path.node;

    if (node.type === 'PgScript') return printScript(node, opts);

    if (node.type.endsWith('Statement')) {
        return printStatement(node, opts);
    }

    function printNode(n: SqlNode): Doc {
        return printExpression(n, opts, printNode);
    }
    return printNode(node);
};

export const printer: Printer<SqlNode> = {
    print,
    getVisitorKeys,
};
