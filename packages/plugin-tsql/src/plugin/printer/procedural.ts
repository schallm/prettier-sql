import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import { keyword, hardline, softline, join, indent, group, onOffKw, line, getDensity, parenList, parenListFill, commaFill } from '@prettier-sql/core/printer/utils';
import { boolEndsWithPendingComment } from './expressions.js';
import { prop, propArr, propStr, propBool, propStrArr, schemaObjectName, builtinTypeDoc, assignmentOp, withTrailingComment, markSingleBody, isSingleBody } from './helpers.js';
// printNode / printBool / qexpr / printStatementWithComments are imported from statements.ts
// — circular but safe in ESM (all imports are function references, never accessed during init)
import { printStatementWithComments, joinBodyStatements, printNode, printBool, qexpr } from './statements.js';
import { printColumnDef, printConstraintDef, printInlineIndex } from './ddl.js';

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function printTransaction(kw: string, node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name');
    const durability = propStr(node, 'delayedDurability');
    return [
        keyword(kw, opts),
        ...(name ? [' ', name] : []),
        durability ? [' ', keyword('WITH', opts), ' (', keyword('DELAYED_DURABILITY', opts), ' = ', keyword(durability, opts), ')'] : '',
        ';',
    ];
}

export function printBeginTransaction(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name');
    const distributed = propBool(node, 'distributed');
    const markDefined = propBool(node, 'markDefined');
    const markDesc = propStr(node, 'markDescription');
    const txnKw = distributed ? keyword('BEGIN DISTRIBUTED TRANSACTION', opts) : keyword('BEGIN TRANSACTION', opts);
    const markPart: Doc = markDefined
        ? [' ', keyword('WITH MARK', opts), ...(markDesc ? [' ', markDesc] : [])]
        : '';
    return [txnKw, ...(name ? [' ', name] : []), markPart, ';'];
}

export function printCommitTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('COMMIT TRANSACTION', node, opts);
}

export function printRollbackTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('ROLLBACK TRANSACTION', node, opts);
}

export function printSaveTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('SAVE TRANSACTION', node, opts);
}

// ---------------------------------------------------------------------------
// CHECKPOINT / KILL / RECONFIGURE
// ---------------------------------------------------------------------------

export function printCheckpoint(node: SqlNode, opts: Options): Doc {
    const duration = propStr(node, 'duration');
    return [keyword('CHECKPOINT', opts), ...(duration ? [' ', duration] : []), ';'];
}

export function printKill(node: SqlNode, opts: Options): Doc {
    const param = propStr(node, 'param') ?? '';
    const statusOnly = propBool(node, 'withStatusOnly');
    return [keyword('KILL', opts), ' ', param, ...(statusOnly ? [' ', keyword('WITH STATUSONLY', opts)] : []), ';'];
}

export function printReconfigure(node: SqlNode, opts: Options): Doc {
    const withOverride = propBool(node, 'withOverride');
    return [keyword('RECONFIGURE', opts), ...(withOverride ? [' ', keyword('WITH OVERRIDE', opts)] : []), ';'];
}

// ---------------------------------------------------------------------------
// DECLARE
// ---------------------------------------------------------------------------

export function printDeclareVariable(node: SqlNode, opts: Options): Doc {
    const decls = propArr(node, 'declarations');
    const declDocs = decls.map((d) => {
        const name = propStr(d, 'name') ?? '@var';
        const dt = propStr(d, 'dataType') ?? 'INT';
        const isUdt = propBool(d, 'isUdt');
        const params = d.props?.['dataTypeParams'];
        const dtDoc: Doc = isUdt ? dt : builtinTypeDoc(dt, opts);
        const typeStr: Doc =
            Array.isArray(params) && params.length > 0
                ? [dtDoc, `(${(params as string[]).join(', ')})`]
                : dtDoc;
        const val = prop(d, 'value');
        const inline: Doc = [name, ' ', typeStr, ...(val ? [' = ', printNode(val, opts)] : [])];
        return { inline, doc: [keyword('DECLARE', opts), ' ', inline, ';'] as Doc };
    });
    // DECLARE @a int, @b int as the only statement of an IF or WHILE stays one statement
    if (decls.length > 1 && isSingleBody(node)) {
        const items = declDocs.map((d) => d.inline);
        return [keyword('DECLARE', opts), ' ', join(', ', items), ';'];
    }
    return join(hardline, declDocs.map((d) => d.doc));
}

export function printDeclareTableVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@t';
    const allDefs = [
        ...propArr(node, 'columns').map((c) => withTrailingComment(c, printColumnDef(c, opts))),
        ...propArr(node, 'constraints').map((c) => withTrailingComment(c, printConstraintDef(c, opts))),
        ...propArr(node, 'indexes').map((i) => withTrailingComment(i, printInlineIndex(i, opts))),
    ];
    // compact: try to keep everything on one line; fill-pack when it wraps
    // standard/spacious: always one definition per line with hard breaks
    const isCompact = getDensity(opts) === 'compact';
    const defsDoc: Doc = isCompact
        ? commaFill(allDefs)
        : join([',', hardline], allDefs);
    const open: Doc = isCompact ? softline : hardline;
    const close: Doc = isCompact ? softline : hardline;
    return group([
        keyword('DECLARE', opts),
        ' ',
        name,
        ' ',
        keyword('TABLE', opts),
        ' (',
        indent([open, defsDoc]),
        close,
        ');',
    ]);
}

// ---------------------------------------------------------------------------
// SET variable / ROWCOUNT
// ---------------------------------------------------------------------------

export function printSetVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@var';

    // XML method call syntax: SET @xmlDoc.modify('...')
    // No assignment operator — the method is called directly on the variable.
    const methodName = propStr(node, 'methodName');
    if (methodName) {
        const methodArgs = propArr(node, 'methodArgs');
        const argDocs = methodArgs.map((a) => printNode(a, opts));
        const separator = propStr(node, 'separator') ?? '.';
        const call: Doc = propBool(node, 'functionCall') ? ['(', join(', ', argDocs), ')'] : '';
        // SET @a.p = 1: a CLR type's property is assigned, not called
        const assigned = prop(node, 'value');
        const assignment: Doc = assigned
            ? [' ', assignmentOp(propStr(node, 'operator') ?? 'Equals'), ' ', printNode(assigned, opts)]
            : '';
        // The method name keeps its case: xml and CLR type methods are case-sensitive
        return [keyword('SET', opts), ' ', name, separator, methodName, call, assignment, ';'];
    }

    const opStr = assignmentOp(propStr(node, 'operator') ?? 'Equals');
    const val = prop(node, 'value');

    let valuePart: Doc;
    if (val?.type === 'CursorDefinition') {
        // SET @cur = CURSOR [options] FOR SELECT ...
        const cursorOptions = val.props?.['options'] as string[] | undefined;
        const cursorSelect = prop(val, 'select');
        const optPart: Doc =
            Array.isArray(cursorOptions) && cursorOptions.length > 0
                ? [' ', join(' ', cursorOptions.map((o) => keyword(o as string, opts)))]
                : '';
        valuePart = group([
            keyword('CURSOR', opts),
            optPart,
            hardline,
            keyword('FOR', opts),
            hardline,
            cursorSelect ? qexpr(cursorSelect, opts) : '',
        ]);
    } else {
        valuePart = val ? printNode(val, opts) : '';
    }

    return [keyword('SET', opts), ' ', name, ' ', opStr, ' ', valuePart, ';'];
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
    const onOff = onOffKw(propBool(node, 'isOn'), opts);
    return [keyword('SET', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

export function printSetStatistics(node: SqlNode, opts: Options): Doc {
    const opt = propStr(node, 'options') ?? '';
    const onOff = onOffKw(propBool(node, 'isOn'), opts);
    return [keyword('SET STATISTICS', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

export function printSetIdentityInsert(node: SqlNode, opts: Options): Doc {
    const onOff = onOffKw(propBool(node, 'isOn'), opts);
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
    const statement = propStr(node, 'statement');
    if (statement) {
        const timeout = propStr(node, 'timeout');
        return [keyword('WAITFOR', opts), ' (', statement, ')', timeout ? [', ', keyword('TIMEOUT', opts), ' ', timeout] : '', ';'];
    }
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
    const partitionRanges = propArr(node, 'partitionRanges');
    let withPart: Doc = '';
    if (partitionRanges.length > 0) {
        const rangeDocs = partitionRanges.map((r) => {
            const fromNode = prop(r, 'from');
            const toNode = prop(r, 'to');
            const fromDoc = fromNode ? printNode(fromNode, opts) : '';
            return toNode ? [fromDoc, ' ', keyword('TO', opts), ' ', printNode(toNode, opts)] : fromDoc;
        });
        withPart = [' ', keyword('WITH', opts), ' (', keyword('PARTITIONS', opts), ' (', join(', ', rangeDocs), '))'];
    }
    return [keyword('TRUNCATE TABLE', opts), ' ', schemaObjectName(prop(node, 'name')), withPart, ';'];
}

// ---------------------------------------------------------------------------
// GOTO / LABEL
// ---------------------------------------------------------------------------

export function printGoto(node: SqlNode, opts: Options): Doc {
    return [keyword('GOTO', opts), ' ', propStr(node, 'label') ?? '', ';'];
}

export function printLabel(node: SqlNode, _opts: Options): Doc {
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
    const allArgs: Doc[] = [
        printNode(prop(node, 'message')!, opts),
        printNode(prop(node, 'severity')!, opts),
        printNode(prop(node, 'state')!, opts),
        ...propArr(node, 'params').map((p) => printNode(p, opts)),
    ];
    const withOpts = node.props?.['withOptions'] as string[] | undefined;
    const withPart: Doc =
        withOpts && withOpts.length > 0
            ? [' ', keyword('WITH', opts), ' ', join(', ', withOpts.map((o) => keyword(o, opts)))]
            : '';
    const argList = getDensity(opts) === 'compact' ? parenListFill(allArgs) : parenList(allArgs);
    return [keyword('RAISERROR', opts), ' ', argList, withPart, ';'];
}

// ---------------------------------------------------------------------------
// TRY / CATCH
// ---------------------------------------------------------------------------

export function printTryCatch(node: SqlNode, opts: Options): Doc {
    const tryStmts = propArr(node, 'tryBody');
    const catchStmts = propArr(node, 'catchBody');
    return [
        keyword('BEGIN TRY', opts),
        indent([hardline, joinBodyStatements(tryStmts, opts)]),
        hardline,
        keyword('END TRY', opts),
        hardline,
        keyword('BEGIN CATCH', opts),
        indent([hardline, joinBodyStatements(catchStmts, opts)]),
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
            indent([hardline, joinBodyStatements(stmts, opts)]),
            hardline,
            keyword('END', opts),
        ];
    }
    markSingleBody(node);
    return indent([hardline, printStatementWithComments(node, opts)]);
}

export function printIf(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const then = prop(node, 'then');
    const els = prop(node, 'else');
    // A comment ending the condition's last line must be followed by a line break
    const condEndsInComment = condition ? boolEndsWithPendingComment(condition) : false;
    const condDoc = condition ? indent(printBool(condition, opts)) : '';
    // Single-statement body (no BEGIN/END): try inline, wrap to next line if too long.
    // BeginEndBlock always goes on a new line.
    if (then) markSingleBody(then);
    const thenDoc = then
        ? then.type === 'BeginEndBlock'
            ? printStatementBlock(then, opts)
            : condEndsInComment
              ? indent([hardline, printStatementWithComments(then, opts)])
              : indent([line, printStatementWithComments(then, opts)])
        : ';';
    // The statement goes on the next line when the condition doesn't fit on one with it
    const parts: Doc[] = [group([keyword('IF', opts), ' ', condDoc, thenDoc])];
    if (els) {
        // ELSE IF chain: keep on the same line to avoid extra nesting
        if (els.type === 'IfStatement') {
            parts.push(hardline, keyword('ELSE', opts), ' ', printIf(els, opts));
        } else {
            parts.push(hardline, keyword('ELSE', opts), printStatementBlock(els, opts));
        }
    }
    return group(parts);
}

export function printWhile(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const body = prop(node, 'body');
    const condDoc = condition ? indent(printBool(condition, opts)) : '';
    return group([keyword('WHILE', opts), ' ', condDoc, body ? printStatementBlock(body, opts) : ';']);
}

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

export function printExecute(node: SqlNode, opts: Options): Doc {
    const sqlStrings = propArr(node, 'sqlStrings');
    const parameters = propArr(node, 'parameters');
    const paramDocs = parameters.map((p) => {
        const pname = propStr(p, 'name');
        const val = prop(p, 'value');
        const valDoc = val ? printNode(val, opts) : '';
        return [pname ? [pname, ' = ', valDoc] : valDoc, propBool(p, 'output') ? [' ', keyword('OUTPUT', opts)] : ''] as Doc;
    });

    const linkedServer = propStr(node, 'linkedServer');
    const contextKind = propStr(node, 'contextKind');
    const tail: Doc = [
        // AS USER | LOGIN = 'name' (dynamic SQL only)
        contextKind ? [' ', keyword(`AS ${contextKind}`, opts), ' = ', propStr(node, 'contextPrincipal') ?? ''] : '',
        linkedServer ? [' ', keyword('AT', opts), ' ', linkedServer] : '',
        printExecuteOptions(node, opts),
        ';',
    ];

    // EXECUTE (@sql) or EXECUTE (@sql1 + @sql2) — with pass-through parameters for AT
    if (sqlStrings.length > 0) {
        const strDocs = sqlStrings.map((s) => printNode(s, opts));
        const innerDoc = strDocs.length === 1 ? strDocs[0]! : join([' + '], strDocs);
        return [keyword('EXECUTE', opts), ' (', innerDoc, paramDocs.length > 0 ? [', ', join(', ', paramDocs)] : '', ')', tail];
    }

    const procNode = prop(node, 'proc');
    const procNumber = propStr(node, 'procNumber');
    const returnVar = propStr(node, 'returnVar');
    // A numbered procedure: EXECUTE dbo.p;2
    const target: Doc = procNode ? [schemaObjectName(procNode), procNumber ? [';', procNumber] : ''] : (propStr(node, 'procVar') ?? '');

    return group([
        keyword('EXECUTE', opts),
        ' ',
        returnVar ? [returnVar, ' = '] : '',
        target,
        parameters.length > 0 ? indent([hardline, join([',', hardline], paramDocs)]) : '',
        tail,
    ]);
}

/** WITH RECOMPILE, RESULT SETS ((a int, ...)) | NONE | UNDEFINED */
function printExecuteOptions(node: SqlNode, opts: Options): Doc {
    const options = propArr(node, 'options');
    if (options.length === 0) return '';
    const docs = options.map((o): Doc =>
        o.type === 'ResultSetsOption'
            ? [keyword('RESULT SETS', opts), ' (', join(', ', propStrArr(o, 'definitions')), ')']
            : keyword(o.text ?? '', opts),
    );
    return [' ', keyword('WITH', opts), ' ', join(', ', docs)];
}

// ---------------------------------------------------------------------------
// Cursor operations
// ---------------------------------------------------------------------------

export function printDeclareCursor(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? 'cursor_name';
    const options = node.props?.['options'];
    const optPart: Doc =
        Array.isArray(options) && options.length > 0
            ? [' ', join(' ', (options as string[]).map((o) => keyword(o, opts)))]
            : '';
    const select = prop(node, 'select');
    // INSENSITIVE exists only in the ISO form, where options come before CURSOR:
    // DECLARE c INSENSITIVE SCROLL CURSOR FOR ...
    const isoForm = Array.isArray(options) && (options as string[]).includes('INSENSITIVE');
    return group([
        keyword('DECLARE', opts),
        ' ',
        name,
        isoForm ? [optPart, ' ', keyword('CURSOR', opts)] : [' ', keyword('CURSOR', opts), optPart],
        hardline,
        keyword('FOR', opts),
        hardline,
        select ? qexpr(select, opts) : '',
        ';',
    ]);
}

/** A cursor reference: [GLOBAL] name — GLOBAL picks the global cursor over a local one of the same name. */
function cursorRef(node: SqlNode, opts: Options): Doc {
    return [propBool(node, 'cursorGlobal') ? [keyword('GLOBAL', opts), ' '] : '', propStr(node, 'cursorName') ?? ''];
}

export function printOpenCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('OPEN', opts), ' ', cursorRef(node, opts), ';'];
}

export function printFetchCursor(node: SqlNode, opts: Options): Doc {
    const fetchType = propStr(node, 'fetchType') ?? 'Next';
    const cursorName = cursorRef(node, opts);
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
    return [keyword('CLOSE', opts), ' ', cursorRef(node, opts), ';'];
}

export function printDeallocateCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('DEALLOCATE', opts), ' ', cursorRef(node, opts), ';'];
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

    const contextDoc: Doc = principal ? [kindKw, ' = ', printNode(principal, opts)] : kindKw;

    const parts: Doc[] = [keyword('EXECUTE AS', opts), ' ', contextDoc];
    if (withNoRevert) parts.push(' ', keyword('WITH NO REVERT', opts));
    if (cookie) parts.push(' ', keyword('WITH COOKIE INTO', opts), ' ', cookie.text ?? '');
    parts.push(';');
    return parts;
}

export function printRevert(node: SqlNode, opts: Options): Doc {
    const cookie = prop(node, 'cookie');
    if (cookie) {
        return [keyword('REVERT', opts), ' ', keyword('WITH COOKIE =', opts), ' ', printNode(cookie, opts), ';'];
    }
    return [keyword('REVERT', opts), ';'];
}
