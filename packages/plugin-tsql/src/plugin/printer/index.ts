import type { AstPath, Doc, Printer } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { printScript, printStatement } from './statements.js';
import { printExpression } from './expressions.js';

function getVisitorKeys(_node: SqlNode): string[] {
    // Prettier uses this to traverse child nodes for embedded language support.
    // We do manual recursion in our printer, so we return empty here.
    return [];
}

const print = (path: AstPath<SqlNode>, options: object, _printChild: (path: AstPath<SqlNode>) => Doc): Doc => {
    const opts = options as Options;
    const node = path.node;

    if (node.type === 'TSqlScript') return printScript(node, opts);

    // For statement-level nodes, use the statement dispatcher.
    // This covers SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, etc.
    if (node.type.endsWith('Statement') || node.type === 'BeginEndBlock') {
        return printStatement(node, opts);
    }

    // Fall back to expression printing for sub-expression nodes that Prettier
    // may call print() on directly (e.g. for embedded languages or diagnostics).
    // Use a properly recursive printFn so all nesting depths are handled.
    function printNode(n: SqlNode): Doc {
        return printExpression(n, opts, printNode);
    }
    return printNode(node);
};

export const printer: Printer<SqlNode> = {
    print,
    getVisitorKeys,
};
