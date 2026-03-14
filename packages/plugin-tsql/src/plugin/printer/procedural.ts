import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, hardline, join, indent, group } from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName, assignmentOp } from './helpers.js';
import { printExpression, printBoolExpr, printQueryExpression } from './expressions.js';
// printStatementWithComments is imported from statements.ts — circular but safe in ESM
// (all imports are function references, never accessed during module initialisation)
import { printStatementWithComments } from './statements.js';
import { printColumnDef, printConstraintDef } from './ddl.js';

// Local wrappers — mirror the ones in statements.ts
function printNode(node: SqlNode, opts: Options): Doc {
    return printExpression(node, opts, (n) => printNode(n, opts));
}

function printBool(node: SqlNode, opts: Options): Doc {
    return printBoolExpr(node, opts, (n) => printNode(n, opts));
}

function qexpr(node: SqlNode, opts: Options): Doc {
    return printQueryExpression(node, opts, (n) => printNode(n, opts));
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function printTransaction(kw: string, node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name');
    return [keyword(kw, opts), ...(name ? [' ', name] : []), ';'];
}

export function printBeginTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('BEGIN TRANSACTION', node, opts);
}

export function printCommitTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('COMMIT TRANSACTION', node, opts);
}

export function printRollbackTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('ROLLBACK TRANSACTION', node, opts);
}

// ---------------------------------------------------------------------------
// DECLARE
// ---------------------------------------------------------------------------

export function printDeclareVariable(node: SqlNode, opts: Options): Doc {
    const decls = propArr(node, 'declarations');
    const declDocs = decls.map((d) => {
        const name = propStr(d, 'name') ?? '@var';
        const dt = propStr(d, 'dataType') ?? 'INT';
        const params = d.props?.['dataTypeParams'];
        const typeStr: Doc =
            Array.isArray(params) && params.length > 0
                ? [keyword(dt, opts), `(${(params as string[]).join(', ')})`]
                : keyword(dt, opts);
        const val = prop(d, 'value');
        return [
            keyword('DECLARE', opts),
            ' ',
            name,
            ' ',
            typeStr,
            ...(val ? [' = ', printNode(val, opts)] : []),
            ';',
        ] as Doc;
    });
    return join(hardline, declDocs);
}

export function printDeclareTableVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@t';
    const allDefs = [
        ...propArr(node, 'columns').map((c) => printColumnDef(c, opts)),
        ...propArr(node, 'constraints').map((c) => printConstraintDef(c, opts)),
    ];
    return group([
        keyword('DECLARE', opts),
        ' ',
        name,
        ' ',
        keyword('TABLE', opts),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ');',
    ]);
}

// ---------------------------------------------------------------------------
// SET variable / ROWCOUNT
// ---------------------------------------------------------------------------

export function printSetVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@var';
    const val = prop(node, 'value');
    const opStr = assignmentOp(propStr(node, 'operator') ?? 'Equals');
    return [keyword('SET', opts), ' ', name, ' ', opStr, ' ', val ? printNode(val, opts) : '', ';'];
}

export function printSetRowCount(node: SqlNode, opts: Options): Doc {
    const rows = prop(node, 'rows');
    return [keyword('SET', opts), ' ', keyword('ROWCOUNT', opts), ' ', rows ? printNode(rows, opts) : '0', ';'];
}

// ---------------------------------------------------------------------------
// USE / SET variants / WAITFOR
// ---------------------------------------------------------------------------

export function printUse(node: SqlNode, opts: Options): Doc {
    return [keyword('USE', opts), ' ', propStr(node, 'database') ?? '', ';'];
}

export function printPredicateSet(node: SqlNode, opts: Options): Doc {
    const opt = propStr(node, 'options') ?? '';
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

export function printSetStatistics(node: SqlNode, opts: Options): Doc {
    const opt = propStr(node, 'options') ?? '';
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET STATISTICS', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

export function printSetIdentityInsert(node: SqlNode, opts: Options): Doc {
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET IDENTITY_INSERT', opts), ' ', schemaObjectName(prop(node, 'table')), ' ', onOff, ';'];
}

export function printSetIsolationLevel(node: SqlNode, opts: Options): Doc {
    const levelMap: Record<string, string> = {
        ReadCommitted: 'READ COMMITTED',
        ReadUncommitted: 'READ UNCOMMITTED',
        RepeatableRead: 'REPEATABLE READ',
        Serializable: 'SERIALIZABLE',
        Snapshot: 'SNAPSHOT',
    };
    const raw = propStr(node, 'level') ?? '';
    const level = levelMap[raw] ?? raw.toUpperCase();
    return [keyword('SET TRANSACTION ISOLATION LEVEL', opts), ' ', keyword(level, opts), ';'];
}

export function printWaitFor(node: SqlNode, opts: Options): Doc {
    const opt = propStr(node, 'option') ?? 'Delay';
    const param = propStr(node, 'parameter') ?? '';
    const kw = opt === 'Time' ? keyword('WAITFOR TIME', opts) : keyword('WAITFOR DELAY', opts);
    return [kw, ' ', param, ';'];
}

// ---------------------------------------------------------------------------
// PRINT / RETURN
// ---------------------------------------------------------------------------

export function printPrint(node: SqlNode, opts: Options): Doc {
    const expr = prop(node, 'expr');
    return [keyword('PRINT', opts), ' ', expr ? printNode(expr, opts) : '', ';'];
}

export function printReturn(node: SqlNode, opts: Options): Doc {
    const expr = prop(node, 'expr');
    return expr ? [keyword('RETURN', opts), ' ', printNode(expr, opts), ';'] : [keyword('RETURN', opts), ';'];
}

// ---------------------------------------------------------------------------
// TRUNCATE TABLE
// ---------------------------------------------------------------------------

export function printTruncateTable(node: SqlNode, opts: Options): Doc {
    return [keyword('TRUNCATE TABLE', opts), ' ', schemaObjectName(prop(node, 'name')), ';'];
}

// ---------------------------------------------------------------------------
// GOTO / LABEL
// ---------------------------------------------------------------------------

export function printGoto(node: SqlNode, opts: Options): Doc {
    return [keyword('GOTO', opts), ' ', propStr(node, 'label') ?? '', ';'];
}

export function printLabel(node: SqlNode, opts: Options): Doc {
    // LabelStatement.Value already includes the trailing colon from ScriptDom
    return propStr(node, 'label') ?? '';
}

// ---------------------------------------------------------------------------
// THROW / RAISERROR
// ---------------------------------------------------------------------------

export function printThrow(node: SqlNode, opts: Options): Doc {
    const errNum = prop(node, 'errorNumber');
    if (!errNum) return [keyword('THROW', opts), ';'];
    return [
        keyword('THROW', opts),
        ' ',
        printNode(errNum, opts),
        ', ',
        printNode(prop(node, 'message')!, opts),
        ', ',
        printNode(prop(node, 'state')!, opts),
        ';',
    ];
}

export function printRaiseError(node: SqlNode, opts: Options): Doc {
    return [
        keyword('RAISERROR', opts),
        ' (',
        printNode(prop(node, 'message')!, opts),
        ', ',
        printNode(prop(node, 'severity')!, opts),
        ', ',
        printNode(prop(node, 'state')!, opts),
        ');',
    ];
}

// ---------------------------------------------------------------------------
// TRY / CATCH
// ---------------------------------------------------------------------------

export function printTryCatch(node: SqlNode, opts: Options): Doc {
    const tryStmts = propArr(node, 'tryBody').map((s) => printStatementWithComments(s, opts));
    const catchStmts = propArr(node, 'catchBody').map((s) => printStatementWithComments(s, opts));
    return [
        keyword('BEGIN TRY', opts),
        indent([hardline, join([hardline, hardline], tryStmts)]),
        hardline,
        keyword('END TRY', opts),
        hardline,
        keyword('BEGIN CATCH', opts),
        indent([hardline, join([hardline, hardline], catchStmts)]),
        hardline,
        keyword('END CATCH', opts),
    ];
}

// ---------------------------------------------------------------------------
// IF / WHILE
// ---------------------------------------------------------------------------

/** Wrap a statement in BEGIN/END if it's a block, otherwise indent inline. */
export function printStatementBlock(node: SqlNode, opts: Options): Doc {
    if (node.type === 'BeginEndBlock') {
        const stmts = propArr(node, 'statements');
        return [
            hardline,
            keyword('BEGIN', opts),
            indent([
                hardline,
                join(
                    [hardline, hardline],
                    stmts.map((s) => printStatementWithComments(s, opts)),
                ),
            ]),
            hardline,
            keyword('END', opts),
        ];
    }
    return indent([hardline, printStatementWithComments(node, opts)]);
}

export function printIf(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const then = prop(node, 'then');
    const els = prop(node, 'else');
    const condDoc = condition ? printBool(condition, opts) : '';
    const thenDoc = then ? printStatementBlock(then, opts) : ';';
    const parts: Doc[] = [keyword('IF', opts), ' ', condDoc, thenDoc];
    if (els) parts.push(hardline, keyword('ELSE', opts), printStatementBlock(els, opts));
    return group(parts);
}

export function printWhile(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const body = prop(node, 'body');
    const condDoc = condition ? printBool(condition, opts) : '';
    return group([keyword('WHILE', opts), ' ', condDoc, body ? printStatementBlock(body, opts) : ';']);
}

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

export function printExecute(node: SqlNode, opts: Options): Doc {
    const procNode = prop(node, 'proc');
    const parameters = propArr(node, 'parameters');

    const paramDocs = parameters.map((p) => {
        const pname = propStr(p, 'name');
        const val = prop(p, 'value');
        const isOutput = propBool(p, 'output');
        const valDoc = val ? printNode(val, opts) : '';
        const parts: Doc[] = pname ? [pname, ' = ', valDoc] : [valDoc];
        if (isOutput) parts.push(' ', keyword('OUTPUT', opts));
        return parts as Doc;
    });

    return group([
        keyword('EXECUTE', opts),
        ' ',
        schemaObjectName(procNode),
        parameters.length > 0 ? indent([hardline, join([',', hardline], paramDocs)]) : '',
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// Cursor operations
// ---------------------------------------------------------------------------

export function printDeclareCursor(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? 'cursor_name';
    const options = node.props?.['options'];
    const optPart: Doc = Array.isArray(options) && options.length > 0 ? [(options as string[]).join(' '), ' '] : [];
    const select = prop(node, 'select');
    return group([
        keyword('DECLARE', opts),
        ' ',
        name,
        ' ',
        ...optPart,
        keyword('CURSOR', opts),
        hardline,
        keyword('FOR', opts),
        hardline,
        select ? qexpr(select, opts) : '',
        ';',
    ]);
}

export function printOpenCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('OPEN', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

export function printFetchCursor(node: SqlNode, opts: Options): Doc {
    const fetchType = propStr(node, 'fetchType') ?? 'Next';
    const cursorName = propStr(node, 'cursorName') ?? '';
    const intoVars = node.props?.['intoVariables'];
    const fetchOffset = prop(node, 'fetchOffset');

    const typeMap: Record<string, string> = {
        Next: 'NEXT',
        Prior: 'PRIOR',
        First: 'FIRST',
        Last: 'LAST',
        Absolute: 'ABSOLUTE',
        Relative: 'RELATIVE',
    };
    const typeKw = keyword(typeMap[fetchType] ?? fetchType.toUpperCase(), opts);
    const offsetPart: Doc = fetchOffset ? [' ', printNode(fetchOffset, opts)] : '';
    const intoPart: Doc =
        Array.isArray(intoVars) && intoVars.length > 0
            ? [' ', keyword('INTO', opts), ' ', join(', ', intoVars as string[])]
            : '';

    return [
        keyword('FETCH', opts),
        ' ',
        typeKw,
        offsetPart,
        ' ',
        keyword('FROM', opts),
        ' ',
        cursorName,
        intoPart,
        ';',
    ];
}

export function printCloseCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('CLOSE', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

export function printDeallocateCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('DEALLOCATE', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

// ---------------------------------------------------------------------------
// EXECUTE AS / REVERT (session context)
// ---------------------------------------------------------------------------

export function printExecuteAsStatement(node: SqlNode, opts: Options): Doc {
    const kind = propStr(node, 'kind') ?? 'Caller';
    const principal = prop(node, 'principal');
    const withNoRevert = propBool(node, 'withNoRevert');
    const cookie = prop(node, 'cookie');

    const kindMap: Record<string, string> = {
        Caller: 'CALLER',
        User: 'USER',
        Login: 'LOGIN',
    };
    const kindKw = keyword(kindMap[kind] ?? kind.toUpperCase(), opts);

    const contextDoc: Doc = principal ? [kindKw, ' = ', printExpression(principal, opts, (n) => n.text ?? '')] : kindKw;

    const parts: Doc[] = [keyword('EXECUTE AS', opts), ' ', contextDoc];
    if (withNoRevert) parts.push(' ', keyword('WITH NO REVERT', opts));
    if (cookie) parts.push(' ', keyword('WITH COOKIE INTO', opts), ' ', cookie.text ?? '');
    parts.push(';');
    return parts;
}

export function printRevert(node: SqlNode, opts: Options): Doc {
    const cookie = prop(node, 'cookie');
    if (cookie) {
        return [
            keyword('REVERT', opts),
            ' ',
            keyword('WITH COOKIE =', opts),
            ' ',
            printExpression(cookie, opts, (n) => n.text ?? ''),
            ';',
        ];
    }
    return [keyword('REVERT', opts), ';'];
}
