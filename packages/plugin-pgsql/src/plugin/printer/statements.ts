import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options, PrintFn } from '@prettier-sql/core/printer/utils';
import {
    keyword,
    hardline,
    join,
    indent,
    group,
    softline,
    softSep,
    hardSep,
    getDensity,
    getCommaStyle,
    fill,
    line,
} from '@prettier-sql/core/printer/utils';
import { prop, propArr, propStr, propBool, propStrArr, rangeVarName, qualifiedName } from './helpers.js';
import { printExpression, printWindowDef } from './expressions.js';

// ---------------------------------------------------------------------------
// Script root
// ---------------------------------------------------------------------------

/**
 * "Minor" statements are short bookkeeping lines that shouldn't force a blank
 * line between them. "Major" statements (DML, DDL, maintenance) do get one.
 *
 * Rule: blank line between two statements unless BOTH are minor.
 */
const MINOR_STATEMENT_TYPES = new Set([
    // transactions
    'TransactionStatement',
    // SET / SHOW
    'VariableSetStatement',
    'VariableShowStatement',
    // security
    'GrantStatement',
    'RevokeStatement',
    // metadata
    'CommentStatement',
    'SecurityLabelStatement',
    'AlterOwnerStatement',
    'AlterObjectSchemaStatement',
    // notifications
    'ListenStatement',
    'UnlistenStatement',
    'NotifyStatement',
    // session bookkeeping
    'CheckpointStatement',
    'DiscardStatement',
    // cursor lifecycle
    'DeclareCursorStatement',
    'FetchStatement',
    'ClosePortalStatement',
]);

export function printScript(node: SqlNode, opts: Options): Doc {
    const statements = propArr(node, 'statements');
    if (statements.length === 0) return '';
    const docs = statements.map((s) => printStatementWithComments(s, opts));
    const parts: Doc[] = [];
    for (let i = 0; i < docs.length; i++) {
        if (i > 0) {
            const prev = statements[i - 1]!;
            const curr = statements[i]!;
            const sep = MINOR_STATEMENT_TYPES.has(prev.type) && MINOR_STATEMENT_TYPES.has(curr.type)
                ? hardline
                : [hardline, hardline];
            parts.push(sep);
        }
        parts.push(docs[i]!);
    }
    return [...parts, hardline];
}

function printStatementWithComments(node: SqlNode, opts: Options): Doc {
    const leading = node.leadingComments;
    const body = printStatement(node, opts);
    const trailing = node.trailingComment ? [' ', node.trailingComment] : '';
    if (!leading?.length) return [body, trailing];
    return [join(hardline, leading), hardline, body, trailing];
}

// ---------------------------------------------------------------------------
// Statement dispatcher
// ---------------------------------------------------------------------------

export function printStatement(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'SelectStatement':        return printSelect(node, opts);
        case 'InsertStatement':        return printInsert(node, opts);
        case 'UpdateStatement':        return printUpdate(node, opts);
        case 'DeleteStatement':        return printDelete(node, opts);
        case 'SetOpStatement':         return printSetOp(node, opts);
        case 'ValuesStatement':        return printValues(node, opts);
        case 'CreateTableStatement':   return printCreateTable(node, opts);
        case 'AlterTableStatement':    return printAlterTable(node, opts);
        case 'CreateViewStatement':    return printCreateView(node, opts);
        case 'CreateFunctionStatement': return printCreateFunction(node, opts);
        case 'CreateIndexStatement':   return printCreateIndex(node, opts);
        case 'DropStatement':          return printDrop(node, opts);
        case 'TruncateStatement':      return printTruncate(node, opts);
        case 'TransactionStatement':   return printTransaction(node, opts);
        case 'VariableSetStatement':   return printVariableSet(node, opts);
        case 'VariableShowStatement':  return printVariableShow(node, opts);
        case 'GrantStatement':         return printGrant(node, opts);
        case 'RevokeStatement':        return printRevoke(node, opts);
        case 'CreateRoleStatement':    return printCreateRole(node, opts);
        case 'AlterRoleStatement':     return printAlterRole(node, opts);
        case 'RenameStatement':        return printRename(node, opts);
        case 'CreateTypeStatement':    return printCreateType(node, opts);
        case 'AlterTypeStatement':     return printAlterType(node, opts);
        case 'CreateSequenceStatement': return printCreateSequence(node, opts);
        case 'AlterSequenceStatement': return printAlterSequence(node, opts);
        case 'CreateSchemaStatement':  return printCreateSchema(node, opts);
        case 'CreateExtensionStatement': return printCreateExtension(node, opts);
        case 'CreateTableAsStatement': return printCreateTableAs(node, opts);
        case 'CreateMatViewStatement': return printCreateMatView(node, opts);
        case 'CreateTriggerStatement': return printCreateTrigger(node, opts);
        case 'CommentStatement':       return printComment(node, opts);
        case 'CallStatement':          return printCall(node, opts);
        case 'DoStatement':            return printDo(node, opts);
        case 'MergeStatement':         return printMerge(node, opts);
        case 'AlterFunctionStatement': return printAlterFunction(node, opts);
        case 'RefreshMatViewStatement': return printRefreshMatView(node, opts);
        case 'SelectIntoStatement':    return printSelectInto(node, opts);
        case 'RuleStatement':          return printRule(node, opts);
        case 'CreatePolicyStatement':  return printCreatePolicy(node, opts);
        case 'AlterPolicyStatement':   return printAlterPolicy(node, opts);
        case 'DeclareCursorStatement': return printDeclareCursor(node, opts);
        case 'FetchStatement':         return printFetch(node, opts);
        case 'ClosePortalStatement':   return printClosePortal(node, opts);
        case 'CopyStatement':          return printCopy(node, opts);
        case 'ExplainStatement':       return printExplain(node, opts);
        case 'PrepareStatement':       return printPrepare(node, opts);
        case 'ExecuteStatement':       return printExecute(node, opts);
        case 'DeallocateStatement':    return printDeallocate(node, opts);
        case 'ListenStatement':        return printListen(node, opts);
        case 'UnlistenStatement':      return printUnlisten(node, opts);
        case 'NotifyStatement':        return printNotify(node, opts);
        case 'LockStatement':          return printLockTable(node, opts);
        case 'CreateTablePartitionOfStatement': return printCreateTablePartitionOf(node, opts);
        case 'VacuumStatement':        return printVacuum(node, opts);
        case 'ClusterStatement':       return printCluster(node, opts);
        case 'ReindexStatement':       return printReindex(node, opts);
        case 'CreateForeignServerStatement':   return printCreateForeignServer(node, opts);
        case 'CreateForeignTableStatement':    return printCreateForeignTable(node, opts);
        case 'CreateUserMappingStatement':     return printCreateUserMapping(node, opts);
        case 'ImportForeignSchemaStatement':   return printImportForeignSchema(node, opts);
        case 'CreatePublicationStatement':     return printCreatePublication(node, opts);
        case 'CreateSubscriptionStatement':    return printCreateSubscription(node, opts);
        case 'DropSubscriptionStatement':      return printDropSubscription(node, opts);
        case 'CreateAggregateStatement':       return printCreateAggregate(node, opts);
        case 'CreateOperatorStatement':        return printCreateOperator(node, opts);
        case 'CreateCollationStatement':       return printCreateCollation(node, opts);
        case 'SecurityLabelStatement':         return printSecurityLabel(node, opts);
        case 'AlterOwnerStatement':            return printAlterOwner(node, opts);
        case 'AlterObjectSchemaStatement':     return printAlterObjectSchema(node, opts);
        case 'CheckpointStatement':            return [[keyword('CHECKPOINT', opts)], ';'];
        case 'DiscardStatement':               return printDiscard(node, opts);
        case 'LoadStatement':                  return printLoad(node, opts);
        case 'AlterSystemStatement':           return printAlterSystem(node, opts);
        case 'ReassignOwnedStatement':         return printReassignOwned(node, opts);
        case 'DropOwnedStatement':             return printDropOwned(node, opts);
        case 'CreateTableSpaceStatement':      return printCreateTableSpace(node, opts);
        case 'DropTableSpaceStatement':        return printDropTableSpace(node, opts);
        default: return node.text ?? node.type;
    }
}

/**
 * Print a SELECT, SET-op, or DML as a query expression (no trailing semicolon).
 * Used when a query appears as a sub-expression: subquery, CTE body, INSERT source.
 */
export function printQueryExpr(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'SetOpStatement':  return printSetOpBody(node, opts);
        case 'InsertStatement': return printInsertBody(node, opts);
        case 'UpdateStatement': return printUpdateBody(node, opts);
        case 'DeleteStatement': return printDeleteBody(node, opts);
        default:                return printSelectBody(node, opts);
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function printWith(opts: Options): PrintFn {
    return function printNode(n: SqlNode): Doc {
        return n.type.endsWith('Statement')
            ? printQueryExpr(n, opts)
            : printExpression(n, opts, printNode);
    };
}

/**
 * Density-aware boolean clause (WHERE / HAVING / ON CONFLICT WHERE).
 * Single predicate: inline in compact/standard; indented in spacious.
 * Multi-predicate (BoolExpr AND/OR):
 *   compact  — fill-pack predicates by width; each stays together on break
 *   standard/spacious — each predicate on its own indented line
 */
function printBoolClause(kw: string, where: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const density = getDensity(opts);
    const isMulti = where.type === 'BoolExpr' && (propStr(where, 'op') ?? 'AND') !== 'NOT';
    const inline = density !== 'spacious' && !isMulti;

    if (inline) return [makeKeyword(kw), ' ', printNode(where)];

    if (density === 'compact' && isMulti) {
        const op = propStr(where, 'op') ?? 'AND';
        const args = propArr(where, 'args');
        const fillParts: Doc[] = [printNode(args[0]!)];
        for (let i = 1; i < args.length; i++) {
            fillParts.push(line);
            fillParts.push([makeKeyword(op), ' ', printNode(args[i]!)]);
        }
        return [makeKeyword(kw), group([indent([line, fill(fillParts)])])];
    }

    return [makeKeyword(kw), indent([hardline, printNode(where)])];
}

/**
 * Single-item keyword clause (GROUP BY, ORDER BY).
 * compact  — fill-pack items by width
 * standard/spacious — each item on its own indented line
 */
function printListClause(kw: string, items: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const density = getDensity(opts);
    const inline = density !== 'spacious' && items.length === 1;
    if (inline) return [makeKeyword(kw), ' ', printNode(items[0]!)];
    if (density === 'compact') {
        const docs = items.map(printNode);
        return [
            makeKeyword(kw),
            group([indent([line, fill(docs.flatMap((d, i) => (i === 0 ? [d] : [[',', line], d])))])]),
        ];
    }
    return [makeKeyword(kw), indent([hardline, join(hardSep(opts), items.map(printNode))])];
}

/**
 * FROM clause: single non-join item stays inline; joins and multiple items are indented.
 */
function printFromClause(items: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const inline = items.length === 1 && items[0]!.type !== 'JoinExpr';
    const body = join([',', hardline], items.map(printNode));
    return [makeKeyword('FROM'), inline ? [' ', body] : indent([hardline, body])];
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

function printCtes(ctes: SqlNode, opts: Options, printNode: PrintFn): Doc[] {
    const makeKeyword = (k: string) => keyword(k, opts);
    const cteList   = propArr(ctes, 'ctes');
    const recursive = propBool(ctes, 'recursive');
    const cteKw     = recursive ? makeKeyword('WITH RECURSIVE') : makeKeyword('WITH');
    const cteDocs = cteList.map((cte) => {
        const name  = propStr(cte, 'name') ?? '';
        const query = prop(cte, 'query');
        const search = prop(cte, 'search');
        const cycle  = prop(cte, 'cycle');
        const parts: Doc[] = [name, ' ', makeKeyword('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
        if (search) {
            const breadthFirst = propBool(search, 'breadthFirst');
            const cols = propStrArr(search, 'columns');
            const seqCol = propStr(search, 'seqColumn') ?? '';
            const firstLast = breadthFirst ? makeKeyword('BREADTH FIRST') : makeKeyword('DEPTH FIRST');
            parts.push(hardline, makeKeyword('SEARCH'), ' ', firstLast, ' ', makeKeyword('BY'), ' ', join(', ', cols), ' ', makeKeyword('SET'), ' ', seqCol);
        }
        if (cycle) {
            const cols = propStrArr(cycle, 'columns');
            const markCol = propStr(cycle, 'markColumn') ?? '';
            const pathCol = propStr(cycle, 'pathColumn') ?? '';
            parts.push(hardline, makeKeyword('CYCLE'), ' ', join(', ', cols), ' ', makeKeyword('SET'), ' ', markCol, ' ', makeKeyword('USING'), ' ', pathCol);
        }
        return parts;
    });
    return [[cteKw, indent([hardline, join([',', hardline], cteDocs)])]];
}

function printSelectBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);

    const ctes      = prop(node, 'ctes');
    const distinct  = propBool(node, 'distinct');
    const targets   = propArr(node, 'targetList');
    const from      = propArr(node, 'from');
    const where     = prop(node, 'where');
    const groupBy   = propArr(node, 'groupBy');
    const having    = prop(node, 'having');
    const orderBy   = propArr(node, 'orderBy');
    const limit     = prop(node, 'limit');
    const offset    = prop(node, 'offset');

    const parts: Doc[] = [];

    if (ctes) {
        parts.push(...printCtes(ctes, opts, printNode));
    }

    const distinctOn = propArr(node, 'distinctOn');
    const selectKw: Doc = distinctOn.length > 0
        ? [makeKeyword('SELECT'), ' ', makeKeyword('DISTINCT ON'), ' (', join(', ', distinctOn.map(printNode)), ')']
        : distinct
          ? [makeKeyword('SELECT'), ' ', makeKeyword('DISTINCT')]
          : makeKeyword('SELECT');
    const density = getDensity(opts);
    const selectInline = density !== 'spacious' && targets.length === 1;
    const targetDocs = targets.map(printNode);
    const targetDoc: Doc = selectInline
        ? targetDocs[0]!
        : density === 'compact'
          ? indent(fill(targetDocs.flatMap((d, i) => (i === 0 ? [d] : [[',', line], d]))))
          : indent([hardline, join(hardSep(opts), targetDocs)]);
    parts.push([selectKw, selectInline ? [' ', targetDoc] : [' ', targetDoc]]);

    if (from.length > 0) {
        parts.push(printFromClause(from, opts, printNode));
    }

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (groupBy.length > 0) parts.push(printListClause('GROUP BY', groupBy, opts, printNode));

    if (having) parts.push(printBoolClause('HAVING', having, opts, printNode));

    if (orderBy.length > 0) parts.push(printListClause('ORDER BY', orderBy, opts, printNode));

    if (limit)  parts.push([makeKeyword('LIMIT'), ' ', printNode(limit)]);
    if (offset) parts.push([makeKeyword('OFFSET'), ' ', printNode(offset)]);

    const locking = propArr(node, 'locking');
    for (const lc of locking) {
        const strength   = propStr(lc, 'strength') ?? 'FOR UPDATE';
        const tables     = propArr(lc, 'tables');
        const waitPolicy = propStr(lc, 'waitPolicy');
        const ofPart: Doc = tables.length > 0
            ? [' ', makeKeyword('OF'), ' ', join(', ', tables.map((t) => rangeVarName(t)))]
            : '';
        const waitPart: Doc = waitPolicy ? [' ', makeKeyword(waitPolicy)] : '';
        parts.push([makeKeyword(strength), ofPart, waitPart]);
    }

    // Named WINDOW clauses: WINDOW w AS (PARTITION BY ... ORDER BY ...)
    const windowClauses = propArr(node, 'windowClauses');
    if (windowClauses.length > 0) {
        const wDocs = windowClauses.map((w) => {
            const wName = propStr(w, 'name') ?? '';
            const wSpec = printWindowDef(w, opts, printNode);
            return [wName, ' ', makeKeyword('AS'), ' (', wSpec, ')'];
        });
        parts.push([makeKeyword('WINDOW'), indent([hardline, join(hardSep(opts), wDocs)])]);
    }

    // compact: use line so clauses can collapse to one line when they fit (e.g. inside EXISTS)
    // standard/spacious: hardline always breaks between clauses
    const clauseSep: Doc = getDensity(opts) === 'compact' ? line : hardline;
    return group(join(clauseSep, parts));
}

function printSelect(node: SqlNode, opts: Options): Doc {
    return [printSelectBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

function printInsertBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);

    const ctes       = prop(node, 'ctes');
    const target     = prop(node, 'target');
    const columns    = propArr(node, 'columns');
    const override   = propStr(node, 'override');
    const source     = prop(node, 'source');
    const onConflict = prop(node, 'onConflict');
    const returning  = propArr(node, 'returning');

    const cteParts = ctes ? printCtes(ctes, opts, printNode) : [];

    const colsPart: Doc = columns.length > 0
        ? group([' (', indent([softline, join(softSep(opts), columns.map((c) => propStr(c, 'name') ?? ''))]), softline, ')'])
        : '';

    const overridePart: Doc = override ? [' ', makeKeyword(`OVERRIDING ${override} VALUE`)] : '';

    const sourcePart: Doc = source?.type === 'DefaultValues'
        ? [hardline, makeKeyword('DEFAULT VALUES')]
        : source?.type === 'ValuesStatement'
          ? printValuesRows(source, opts, printNode)
          : source
            ? [hardline, printQueryExpr(source, opts)]
            : '';

    const parts: Doc[] = [
        ...cteParts,
        [makeKeyword('INSERT INTO'), ' ', rangeVarName(target), colsPart, overridePart, sourcePart],
    ];

    if (onConflict) parts.push(printOnConflict(onConflict, opts, printNode));

    if (returning.length > 0) {
        parts.push(printListClause('RETURNING', returning, opts, printNode));
    }

    return group(join(hardline, parts));
}

function printInsert(node: SqlNode, opts: Options): Doc {
    return [printInsertBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function fillList(docs: Doc[], opts: Options): Doc {
    const leading = getCommaStyle(opts) === 'leading';
    return fill(
        docs.flatMap((d, i) => {
            if (i === 0) return [d] as Doc[];
            return leading ? ([line, [', ', d]] as Doc[]) : ([[',', line], d] as Doc[]);
        }),
    );
}

function printUpdateBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);

    const ctes      = prop(node, 'ctes');
    const target    = prop(node, 'target');
    const sets      = propArr(node, 'sets');
    const from      = propArr(node, 'from');
    const where     = prop(node, 'where');
    const returning = propArr(node, 'returning');
    const density   = getDensity(opts);

    const setDocs = sets.map((s) => {
        const name = propStr(s, 'name') ?? '';
        const val  = prop(s, 'val');
        return [name, ' = ', val ? printNode(val) : ''] as Doc;
    });

    const parts: Doc[] = ctes ? printCtes(ctes, opts, printNode) : [];
    parts.push(
        [makeKeyword('UPDATE'), ' ', rangeVarName(target)],
        [
            makeKeyword('SET'),
            density !== 'spacious' && setDocs.length === 1
                ? [' ', setDocs[0]!]
                : density === 'spacious'
                  ? indent([hardline, join(hardSep(opts), setDocs)])
                  : indent([hardline, fillList(setDocs, opts)]),
        ],
    );

    if (from.length > 0) {
        parts.push(printFromClause(from, opts, printNode));
    }

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (returning.length > 0) {
        parts.push(printListClause('RETURNING', returning, opts, printNode));
    }

    return group(join(hardline, parts));
}

function printUpdate(node: SqlNode, opts: Options): Doc {
    return [printUpdateBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

function printDeleteBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);

    const ctes      = prop(node, 'ctes');
    const target    = prop(node, 'target');
    const using     = propArr(node, 'using');
    const where     = prop(node, 'where');
    const returning = propArr(node, 'returning');

    const parts: Doc[] = ctes ? printCtes(ctes, opts, printNode) : [];
    parts.push([makeKeyword('DELETE FROM'), ' ', rangeVarName(target)]);

    if (using.length > 0) parts.push(printListClause('USING', using, opts, printNode));

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (returning.length > 0) {
        parts.push(printListClause('RETURNING', returning, opts, printNode));
    }

    return group(join(hardline, parts));
}

function printDelete(node: SqlNode, opts: Options): Doc {
    return [printDeleteBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// SET operations (UNION / INTERSECT / EXCEPT)
// ---------------------------------------------------------------------------

function printSetOpBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword    = (k: string) => keyword(k, opts);
    const op    = propStr(node, 'op') ?? 'UNION';
    const all   = propBool(node, 'all');
    const lhs   = prop(node, 'lhs');
    const rhs   = prop(node, 'rhs');
    const opKw  = all ? makeKeyword(`${op} ALL`) : makeKeyword(op);

    return [
        lhs ? printQueryExpr(lhs, opts) : '',
        hardline, opKw, hardline,
        rhs ? printQueryExpr(rhs, opts) : '',
    ];
}

function printSetOp(node: SqlNode, opts: Options): Doc {
    return [printSetOpBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// VALUES
// ---------------------------------------------------------------------------

/**
 * Render VALUES rows without a trailing semicolon — used as INSERT source.
 * Uses softSep within each row and hardSep between rows, matching tsql style.
 */
function printValuesRows(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const rows    = propArr(node, 'rows');
    const rowDocs = rows.map((row) => {
        const items = propArr(row, 'items').map(printNode);
        return group(['(', indent([softline, join(softSep(opts), items)]), softline, ')']);
    });

    if (rowDocs.length === 1) {
        return [hardline, makeKeyword('VALUES'), ' ', rowDocs[0]!];
    }

    const density  = getDensity(opts);
    const colCount = propArr(rows[0]!, 'items').length;
    // compact: fill-pack all multi-row inserts
    // standard + 1-column rows: fill-pack (rows are short)
    // standard + multi-column rows: one per line
    // spacious: always one per line
    const useFill = density === 'compact' || (density === 'standard' && colCount === 1);
    return [hardline, makeKeyword('VALUES'), indent([hardline, useFill ? fillList(rowDocs, opts) : join(hardSep(opts), rowDocs)])];
}

function printValues(node: SqlNode, opts: Options): Doc {
    return [printValuesRows(node, opts, printWith(opts)), ';'];
}

// ---------------------------------------------------------------------------
// ON CONFLICT
// ---------------------------------------------------------------------------

function printOnConflict(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const action     = propStr(node, 'action') ?? 'NOTHING';
    const target     = prop(node, 'target');
    const sets       = propArr(node, 'sets');
    const where      = prop(node, 'where');

    let targetDoc: Doc = '';
    if (target) {
        const cols       = propArr(target, 'columns');
        const constraint = propStr(target, 'constraint');
        if (constraint) {
            targetDoc = [' ', makeKeyword('ON CONSTRAINT'), ' ', constraint];
        } else if (cols.length > 0) {
            targetDoc = group([' (', indent([softline, join(softSep(opts), cols.map((c) => propStr(c, 'name') ?? ''))]), softline, ')']);
        }
    }

    if (action === 'NOTHING') {
        return [makeKeyword('ON CONFLICT'), targetDoc, ' ', makeKeyword('DO NOTHING')];
    }

    // DO UPDATE SET
    const setDocs = sets.map((s) => {
        const name = propStr(s, 'name') ?? '';
        const val  = prop(s, 'val');
        return [name, ' = ', val ? printNode(val) : ''] as Doc;
    });

    const density = getDensity(opts);
    const parts: Doc[] = [
        [makeKeyword('ON CONFLICT'), targetDoc, ' ', makeKeyword('DO UPDATE')],
        [
            makeKeyword('SET'),
            density !== 'spacious' && setDocs.length === 1
                ? [' ', setDocs[0]!]
                : density === 'spacious'
                  ? indent([hardline, join(hardSep(opts), setDocs)])
                  : indent([hardline, fillList(setDocs, opts)]),
        ],
    ];

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    return join(hardline, parts);
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

function printCreateTable(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const name     = prop(node, 'name');
    const columns  = propArr(node, 'columns');
    const partitionBy = prop(node, 'partitionBy');

    const partitionDoc: Doc = partitionBy
        ? [hardline, makeKeyword('PARTITION BY'), ' ', makeKeyword(propStr(partitionBy, 'strategy') ?? 'RANGE'),
           ' (', join(', ', propStrArr(partitionBy, 'columns')), ')']
        : '';

    return [
        makeKeyword('CREATE TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ')',
        partitionDoc,
        ';',
    ];
}

function printAlterTable(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const name     = prop(node, 'name');
    const commands = propArr(node, 'commands');

    return [
        makeKeyword('ALTER TABLE'), ' ', rangeVarName(name),
        indent([hardline, join([',', hardline], commands.map(printNode))]),
        ';',
    ];
}

function printCreateView(node: SqlNode, opts: Options): Doc {
    const makeKeyword    = (k: string) => keyword(k, opts);
    const name  = prop(node, 'name');
    const body  = prop(node, 'body');

    return [
        makeKeyword('CREATE VIEW'), ' ', rangeVarName(name), hardline,
        makeKeyword('AS'), hardline,
        body ? printQueryExpr(body, opts) : '',
        ';',
    ];
}

function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const makeKeyword           = (k: string) => keyword(k, opts);
    const printNode    = printWith(opts);
    const name         = propStr(node, 'name') ?? '';
    const parameters   = propArr(node, 'parameters');
    const returnType   = propStr(node, 'returnType');
    const returnsTable = propArr(node, 'returnsTable');
    const language     = propStr(node, 'language');
    const body         = propStr(node, 'body');

    const parts: Doc[] = [
        makeKeyword('CREATE FUNCTION'), ' ', name,
        '(', join(', ', parameters.map(printNode)), ')',
    ];

    if (returnsTable.length > 0) {
        parts.push(hardline, makeKeyword('RETURNS TABLE'), ' (', join(', ', returnsTable.map(printNode)), ')');
    } else if (returnType) {
        parts.push(hardline, makeKeyword('RETURNS'), ' ', makeKeyword(returnType));
    }
    if (language)   parts.push(hardline, makeKeyword('LANGUAGE'), ' ', language);
    if (body != null) {
        parts.push(hardline, makeKeyword('AS'), ' ', '$$', body, '$$');
    }

    return [join('', parts), ';'];
}

function printCreateIndex(node: SqlNode, opts: Options): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const printNode   = printWith(opts);
    const unique      = propBool(node, 'unique');
    const concurrent  = propBool(node, 'concurrent');
    const ifNotExists = propBool(node, 'ifNotExists');
    const indexName   = propStr(node, 'indexName') ?? '';
    const relation    = prop(node, 'relation');
    const columns     = propArr(node, 'columns');
    const including   = propArr(node, 'including');
    const accessMethod = propStr(node, 'accessMethod');
    const where       = prop(node, 'where');

    const keyword1 = unique ? makeKeyword('CREATE UNIQUE INDEX') : makeKeyword('CREATE INDEX');
    const parts: Doc[] = [keyword1];
    if (concurrent)  parts.push(' ', makeKeyword('CONCURRENTLY'));
    if (ifNotExists) parts.push(' ', makeKeyword('IF NOT EXISTS'));
    parts.push(' ', indexName, ' ', makeKeyword('ON'), ' ', rangeVarName(relation));
    if (accessMethod) parts.push(' ', makeKeyword('USING'), ' ', accessMethod);
    parts.push(' (', join(', ', columns.map(printNode)), ')');
    if (including.length > 0) parts.push(' ', makeKeyword('INCLUDE'), ' (', join(', ', including.map(printNode)), ')');
    if (where) parts.push(' ', makeKeyword('WHERE'), ' ', printNode(where));
    parts.push(';');
    return parts;
}

function printTruncate(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (k: string) => keyword(k, opts);
    const relations = propArr(node, 'relations');
    const restart   = propBool(node, 'restartSeqs');
    const cascade   = propBool(node, 'cascade');

    return [
        makeKeyword('TRUNCATE TABLE'), ' ', join(', ', relations.map(rangeVarName)),
        restart  ? [' ', makeKeyword('RESTART IDENTITY')]  : '',
        cascade  ? [' ', makeKeyword('CASCADE')]            : '',
        ';',
    ];
}

function printDrop(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const objectType = propStr(node, 'objectType') ?? '';
    const names      = propStrArr(node, 'names');
    const ifExists   = propBool(node, 'ifExists');
    const cascade    = propBool(node, 'cascade');

    return [
        makeKeyword('DROP'), ' ', makeKeyword(objectType),
        ifExists ? [' ', makeKeyword('IF EXISTS')] : '',
        names.length > 0 ? [' ', join(', ', names)] : '',
        cascade  ? [' ', makeKeyword('CASCADE')]   : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// SET / SHOW / RESET
// ---------------------------------------------------------------------------

function printVariableSet(node: SqlNode, opts: Options): Doc {
    const makeKeyword     = (k: string) => keyword(k, opts);
    const kind   = propStr(node, 'kind') ?? 'SET';
    const name   = propStr(node, 'name') ?? '';
    const values = propStrArr(node, 'values');
    const local  = propBool(node, 'local');

    if (kind === 'RESET ALL') return [makeKeyword('RESET ALL'), ';'];
    if (kind === 'RESET')     return [[makeKeyword('RESET'), ' ', name], ';'];

    const localKw: Doc = local ? [makeKeyword('LOCAL'), ' '] : '';

    if (kind === 'SET DEFAULT') {
        return [[makeKeyword('SET'), ' ', localKw, name, ' ', makeKeyword('TO'), ' ', makeKeyword('DEFAULT')], ';'];
    }

    // SET name = value(s)
    // - Starts with digit or contains special chars: must be quoted
    // - Otherwise: lowercase (PostgreSQL normalizes unquoted identifiers)
    const valDocs: Doc[] = values.map((v) => {
        if (/^[0-9]/.test(v) || /[^a-zA-Z0-9_$]/.test(v)) return `'${v.replace(/'/g, "''")}'`;
        return v.toLowerCase();
    });
    return [[makeKeyword('SET'), ' ', localKw, name, ' = ', join(', ', valDocs)], ';'];
}

function printVariableShow(node: SqlNode, opts: Options): Doc {
    const makeKeyword   = (k: string) => keyword(k, opts);
    const name = propStr(node, 'name') ?? '';
    return [[makeKeyword('SHOW'), ' ', name], ';'];
}

// ---------------------------------------------------------------------------
// GRANT / REVOKE
// ---------------------------------------------------------------------------

function printGrantRevoke(node: SqlNode, opts: Options, isGrant: boolean): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const privs   = (node.props?.['privs'] as string[] | undefined) ?? [];
    const objtype = propStr(node, 'objtype') ?? '';
    const objects = propArr(node, 'objects');
    const grantees = (node.props?.['grantees'] as string[] | undefined) ?? [];
    const grantOption = propBool(node, 'grantOption');
    const cascade    = propBool(node, 'cascade');

    const privsDoc: Doc = privs.length > 0 ? join(', ', privs.map(makeKeyword)) : makeKeyword('ALL PRIVILEGES');
    const verb: Doc = isGrant ? makeKeyword('GRANT') : makeKeyword('REVOKE');
    const toFrom: Doc = isGrant ? makeKeyword('TO') : makeKeyword('FROM');

    const objectsDoc: Doc = objects.length > 0
        ? join(', ', objects.map(printNode))
        : '';

    const parts: Doc[] = [
        [verb, ' ', privsDoc, ' ', makeKeyword('ON'), ' ', makeKeyword(objtype), objectsDoc ? [' ', objectsDoc] : ''],
        [toFrom, ' ', join(', ', grantees)],
    ];

    if (isGrant && grantOption) parts.push(makeKeyword('WITH GRANT OPTION'));
    if (!isGrant && cascade)    parts.push(makeKeyword('CASCADE'));

    return [join(hardline, parts), ';'];
}

function printGrant(node: SqlNode, opts: Options): Doc {
    return printGrantRevoke(node, opts, true);
}

function printRevoke(node: SqlNode, opts: Options): Doc {
    return printGrantRevoke(node, opts, false);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER ROLE
// ---------------------------------------------------------------------------

function printCreateRole(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const stmtType = propStr(node, 'stmtType') ?? 'ROLE';
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [[makeKeyword(`CREATE ${stmtType}`), ' ', name]];
    if (options.length > 0) parts.push(join(' ', options.map(makeKeyword)));
    return [join(hardline, parts), ';'];
}

function printAlterRole(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [[makeKeyword('ALTER ROLE'), ' ', name]];
    if (options.length > 0) parts.push(join(' ', options.map(makeKeyword)));
    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// RENAME (ALTER TABLE ... RENAME / ALTER INDEX ... RENAME / etc.)
// ---------------------------------------------------------------------------

function printRename(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const renameType = propStr(node, 'renameType') ?? 'RENAME TABLE';
    const relation   = prop(node, 'relation');
    const objName    = propStr(node, 'objName');
    const oldName    = propStr(node, 'oldName');
    const newName    = propStr(node, 'newName') ?? '';

    if (renameType === 'RENAME TABLE') {
        return [[makeKeyword('ALTER TABLE'), ' ', rangeVarName(relation), ' ', makeKeyword('RENAME TO'), ' ', newName], ';'];
    }
    if (renameType === 'RENAME COLUMN') {
        return [[makeKeyword('ALTER TABLE'), ' ', rangeVarName(relation), ' ', makeKeyword('RENAME COLUMN'), ' ', oldName ?? '', ' ', makeKeyword('TO'), ' ', newName], ';'];
    }
    // FUNCTION, PROCEDURE — use objName + arg types
    if (renameType === 'RENAME FUNCTION' || renameType === 'RENAME PROCEDURE') {
        const objKw    = renameType.replace('RENAME ', '');
        const argTypes = (node.props?.['objArgTypes'] as string[] | undefined) ?? [];
        const argList: Doc = argTypes.length > 0 ? ['(', join(', ', argTypes.map((t) => makeKeyword(t))), ')'] : '()';
        return [[makeKeyword(`ALTER ${objKw}`), ' ', objName ?? '', argList, ' ', makeKeyword('RENAME TO'), ' ', newName], ';'];
    }
    // INDEX, SCHEMA, VIEW, MATERIALIZED VIEW, SEQUENCE, TYPE, TRIGGER ...
    const objKw = renameType.replace('RENAME ', '');
    return [[makeKeyword(`ALTER ${objKw}`), ' ', objName ?? rangeVarName(relation) ?? oldName ?? '', ' ', makeKeyword('RENAME TO'), ' ', newName], ';'];
}

// ---------------------------------------------------------------------------
// CREATE TYPE / ALTER TYPE
// ---------------------------------------------------------------------------

function printCreateType(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const kind     = propStr(node, 'kind') ?? 'COMPOSITE';
    const typeName = propStr(node, 'typeName') ?? '';
    const columns  = propArr(node, 'columns');
    const values   = (node.props?.['values'] as string[] | undefined) ?? [];

    if (kind === 'ENUM') {
        const valList: Doc = values.length > 0
            ? ['(', indent([hardline, join([',', hardline], values.map((v) => `'${v}'`))]), hardline, ')']
            : '()';
        return [[makeKeyword('CREATE TYPE'), ' ', typeName, ' ', makeKeyword('AS ENUM'), ' ', valList], ';'];
    }

    // COMPOSITE
    return [
        makeKeyword('CREATE TYPE'), ' ', typeName, ' ', makeKeyword('AS'), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ');',
    ];
}

function printAlterType(node: SqlNode, opts: Options): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const typeName    = propStr(node, 'typeName') ?? '';
    const newVal      = propStr(node, 'newVal') ?? '';
    const neighbor    = propStr(node, 'neighbor');
    const isAfter     = propBool(node, 'isAfter');
    const ifNotExists = propBool(node, 'ifNotExists');

    const ifNotExistsDoc: Doc = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    const placement: Doc = neighbor
        ? [' ', isAfter ? makeKeyword('AFTER') : makeKeyword('BEFORE'), ' ', `'${neighbor}'`]
        : '';

    return [[makeKeyword('ALTER TYPE'), ' ', typeName, ' ', makeKeyword('ADD VALUE'), ' ', ifNotExistsDoc, `'${newVal}'`, placement], ';'];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER SEQUENCE
// ---------------------------------------------------------------------------

function printCreateSequence(node: SqlNode, opts: Options): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const schema      = propStr(node, 'schema');
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const options     = (node.props?.['options'] as string[] | undefined) ?? [];

    const qname = qualifiedName(schema, name);
    const ifNotExistsDoc: Doc = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    const parts: Doc[] = [[makeKeyword('CREATE SEQUENCE'), ' ', ifNotExistsDoc, qname]];
    for (const opt of options) parts.push(makeKeyword(opt));
    return [join(hardline, parts), ';'];
}

function printAlterSequence(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const schema  = propStr(node, 'schema');
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const qname = qualifiedName(schema, name);
    const parts: Doc[] = [[makeKeyword('ALTER SEQUENCE'), ' ', qname]];
    for (const opt of options) parts.push(makeKeyword(opt));
    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// CREATE SCHEMA
// ---------------------------------------------------------------------------

function printCreateSchema(node: SqlNode, opts: Options): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const name        = propStr(node, 'name') ?? '';
    const authRole    = propStr(node, 'authRole');
    const ifNotExists = propBool(node, 'ifNotExists');

    const ifNotExistsDoc: Doc   = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    const authDoc: Doc = authRole ? [' ', makeKeyword('AUTHORIZATION'), ' ', authRole] : '';
    return [[makeKeyword('CREATE SCHEMA'), ' ', ifNotExistsDoc, name, authDoc], ';'];
}

// ---------------------------------------------------------------------------
// CREATE EXTENSION
// ---------------------------------------------------------------------------

function printCreateExtension(node: SqlNode, opts: Options): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const schema      = propStr(node, 'schema');
    const version     = propStr(node, 'version');

    const ifNotExistsDoc: Doc     = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    const schemaDoc: Doc = schema  ? [hardline, makeKeyword('SCHEMA'), ' ', schema]  : '';
    const versionDoc: Doc = version ? [hardline, makeKeyword('VERSION'), ' ', `'${version}'`] : '';
    return [[makeKeyword('CREATE EXTENSION'), ' ', ifNotExistsDoc, `"${name}"`, schemaDoc, versionDoc], ';'];
}

// ---------------------------------------------------------------------------
// CREATE TABLE AS / CREATE MATERIALIZED VIEW
// ---------------------------------------------------------------------------

function printCreateTableAs(node: SqlNode, opts: Options): Doc {
    return printCreateAsQuery(node, opts, 'CREATE TABLE');
}

function printCreateMatView(node: SqlNode, opts: Options): Doc {
    return printCreateAsQuery(node, opts, 'CREATE MATERIALIZED VIEW');
}

function printCreateAsQuery(node: SqlNode, opts: Options, kw: string): Doc {
    const makeKeyword          = (k: string) => keyword(k, opts);
    const schema      = propStr(node, 'schema');
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const query       = prop(node, 'query');

    const qname = qualifiedName(schema, name);
    const ifNotExistsDoc: Doc = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    return [
        makeKeyword(kw), ' ', ifNotExistsDoc, qname, ' ', makeKeyword('AS'),
        hardline, query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// CREATE TRIGGER
// ---------------------------------------------------------------------------

function printCreateTrigger(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const name     = propStr(node, 'name') ?? '';
    const timing   = propStr(node, 'timing') ?? 'AFTER';
    const events   = (node.props?.['events'] as string[] | undefined) ?? [];
    const relation = prop(node, 'relation');
    const forEach  = propStr(node, 'forEach') ?? 'ROW';
    const funcName = propStr(node, 'funcName') ?? '';
    const when     = prop(node, 'when');

    const eventDoc: Doc = join([' ', makeKeyword('OR'), ' '], events.map(makeKeyword));
    const whenDoc: Doc  = when ? [hardline, makeKeyword('WHEN'), ' (', printNode(when), ')'] : '';

    return [
        makeKeyword('CREATE TRIGGER'), ' ', name,
        hardline, makeKeyword(timing), ' ', eventDoc, ' ', makeKeyword('ON'), ' ', rangeVarName(relation),
        hardline, makeKeyword(`FOR EACH ${forEach}`),
        whenDoc,
        hardline, makeKeyword('EXECUTE FUNCTION'), ' ', funcName, '()',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// COMMENT ON
// ---------------------------------------------------------------------------

function printComment(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const objtype = propStr(node, 'objtype') ?? '';
    const object  = propStr(node, 'object') ?? '';
    const comment = propStr(node, 'comment');

    const commentVal: Doc = comment != null ? `'${comment.replace(/'/g, "''")}'` : makeKeyword('NULL');
    return [[makeKeyword('COMMENT ON'), ' ', makeKeyword(objtype), ' ', object, ' ', makeKeyword('IS'), ' ', commentVal], ';'];
}

// ---------------------------------------------------------------------------
// Transaction control
// ---------------------------------------------------------------------------

function printTransaction(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const kind = propStr(node, 'kind') ?? 'COMMIT';
    const savepoint = propStr(node, 'savepoint');
    const gid = propStr(node, 'gid');
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [makeKeyword(kind)];

    // SAVEPOINT, RELEASE SAVEPOINT, ROLLBACK TO SAVEPOINT all take a savepoint name
    if (kind === 'RELEASE') parts.push(' ', makeKeyword('SAVEPOINT'));
    if (kind === 'ROLLBACK TO') parts.push(' ', makeKeyword('SAVEPOINT'));
    if (savepoint) parts.push(' ', savepoint);
    if (gid) parts.push(' ', `'${gid}'`);
    if (options.length > 0) parts.push(' ', join(', ', options.map((o) => makeKeyword(o))));

    return [parts, ';'];
}

// ---------------------------------------------------------------------------
// CALL
// ---------------------------------------------------------------------------

function printCall(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const call = prop(node, 'call');
    return [[makeKeyword('CALL'), ' ', call ? printNode(call) : ''], ';'];
}

// ---------------------------------------------------------------------------
// DO
// ---------------------------------------------------------------------------

function printDo(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const language = propStr(node, 'language') ?? 'plpgsql';
    const body = propStr(node, 'body') ?? '';
    // Standard convention: body first, LANGUAGE after
    return [[makeKeyword('DO'), ' ', '$$', body, '$$', hardline, makeKeyword('LANGUAGE'), ' ', language], ';'];
}

// ---------------------------------------------------------------------------
// MERGE
// ---------------------------------------------------------------------------

function printMerge(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);

    const target    = prop(node, 'target');
    const source    = prop(node, 'source');
    const on        = prop(node, 'on');
    const whens     = propArr(node, 'whens');
    const returning = propArr(node, 'returning');
    const ctes      = prop(node, 'ctes');

    const parts: Doc[] = [];

    if (ctes) parts.push(...printCtes(ctes, opts, printNode));

    parts.push([makeKeyword('MERGE INTO'), ' ', target ? printNode(target) : '']);
    parts.push([makeKeyword('USING'), ' ', source ? printNode(source) : '']);
    parts.push([makeKeyword('ON'), ' ', on ? printNode(on) : '']);

    for (const w of whens) {
        const matchKind = propStr(w, 'matchKind') ?? 'MATCHED';
        const cmd       = propStr(w, 'cmd') ?? 'DO NOTHING';
        const condition = prop(w, 'condition');
        const targets   = propArr(w, 'targets');
        const values    = propArr(w, 'values');

        let whenLine: Doc = [makeKeyword('WHEN'), ' ', makeKeyword(matchKind)];
        if (condition) whenLine = [whenLine, ' ', makeKeyword('AND'), ' ', printNode(condition)];
        whenLine = [whenLine, ' ', makeKeyword('THEN')];

        let actionDoc: Doc;
        if (cmd === 'DO NOTHING') {
            actionDoc = makeKeyword('DO NOTHING');
        } else if (cmd === 'DELETE') {
            actionDoc = makeKeyword('DELETE');
        } else if (cmd === 'UPDATE') {
            // ResTarget: name=column, val=value → "col = val"
            const assignments: Doc[] = targets.map((t) => {
                const column = propStr(t, 'name') ?? '';
                const val = prop(t, 'val');
                return [column, ' = ', val ? printNode(val) : ''] as Doc;
            });
            actionDoc = [makeKeyword('UPDATE SET'), indent([hardline, join(hardSep(opts), assignments)])];
        } else { // INSERT
            const cols = targets.filter((t) => t.type === 'ResTarget').map((t) => propStr(t, 'name') ?? '');
            const colList: Doc = cols.length > 0 ? [' (', join(', ', cols), ')'] : '';
            const valList: Doc = values.length > 0
                ? [makeKeyword('VALUES'), ' (', join(', ', values.map(printNode)), ')']
                : [makeKeyword('DEFAULT VALUES')];
            actionDoc = [makeKeyword('INSERT'), colList, hardline, valList];
        }

        parts.push([whenLine, indent([hardline, actionDoc])]);
    }

    if (returning.length > 0) {
        parts.push(printListClause('RETURNING', returning, opts, printNode));
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// ALTER FUNCTION / PROCEDURE
// ---------------------------------------------------------------------------

function printAlterFunction(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const rename   = propStr(node, 'rename');
    const options  = (node.props?.['options'] as Array<{ name: string; value: string }> | undefined) ?? [];

    const argList: Doc = argTypes.length > 0
        ? ['(', join(', ', argTypes.map((t) => makeKeyword(t))), ')']
        : '()';

    if (rename) {
        return [[makeKeyword('ALTER FUNCTION'), ' ', name, argList, ' ', makeKeyword('RENAME TO'), ' ', rename], ';'];
    }

    const optionDocs = options.map((o): Doc => {
        switch (o.name) {
            case 'volatility': return makeKeyword(o.value ?? '');
            case 'cost':       return [makeKeyword('COST'), ' ', o.value ?? ''];
            case 'rows':       return [makeKeyword('ROWS'), ' ', o.value ?? ''];
            case 'called':     return makeKeyword(o.value === 'true' ? 'CALLED ON NULL INPUT' : 'STRICT');
            case 'security':   return makeKeyword(o.value === 'true' ? 'SECURITY DEFINER' : 'SECURITY INVOKER');
            default:           return [makeKeyword('SET'), ' ', o.name, ' = ', o.value ?? ''];
        }
    });
    return [[makeKeyword('ALTER FUNCTION'), ' ', name, argList, indent([hardline, join(hardline, optionDocs)])], ';'];
}

// ---------------------------------------------------------------------------
// ALTER OWNER / ALTER ... SET SCHEMA
// ---------------------------------------------------------------------------

function printAlterOwner(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const objType = propStr(node, 'objType') ?? '';
    const name    = propStr(node, 'name') ?? '';
    const newOwner = propStr(node, 'newOwner') ?? '';
    return [[makeKeyword(`ALTER ${objType}`), ' ', name, ' ', makeKeyword('OWNER TO'), ' ', newOwner], ';'];
}

function printAlterObjectSchema(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const objType  = propStr(node, 'objType') ?? '';
    const name     = propStr(node, 'name') ?? '';
    const newSchema = propStr(node, 'newSchema') ?? '';
    return [[makeKeyword(`ALTER ${objType}`), ' ', name, ' ', makeKeyword('SET SCHEMA'), ' ', newSchema], ';'];
}

// ---------------------------------------------------------------------------
// REFRESH MATERIALIZED VIEW
// ---------------------------------------------------------------------------

function printRefreshMatView(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const name       = prop(node, 'name');
    const concurrent = propBool(node, 'concurrent');

    return [
        makeKeyword('REFRESH MATERIALIZED VIEW'),
        concurrent ? [' ', makeKeyword('CONCURRENTLY')] : '',
        ' ', rangeVarName(name),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// SELECT INTO
// ---------------------------------------------------------------------------

function printSelectInto(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const temp     = propBool(node, 'temp');
    const into     = prop(node, 'into');
    const targets  = propArr(node, 'targetList');
    const from     = propArr(node, 'from');
    const where    = prop(node, 'where');
    const groupBy  = propArr(node, 'groupBy');
    const having   = prop(node, 'having');
    const orderBy  = propArr(node, 'orderBy');
    const limit    = prop(node, 'limit');
    const offset   = prop(node, 'offset');

    const parts: Doc[] = [];
    parts.push(printListClause('SELECT', targets, opts, printNode));

    const intoKw: Doc = temp ? [makeKeyword('INTO'), ' ', makeKeyword('TEMP')] : makeKeyword('INTO');
    parts.push([intoKw, indent([hardline, rangeVarName(into)])]);

    if (from.length > 0) {
        parts.push(printFromClause(from, opts, printNode));
    }
    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));
    if (groupBy.length > 0) parts.push(printListClause('GROUP BY', groupBy, opts, printNode));
    if (having) parts.push(printBoolClause('HAVING', having, opts, printNode));
    if (orderBy.length > 0) parts.push(printListClause('ORDER BY', orderBy, opts, printNode));
    if (limit)  parts.push([makeKeyword('LIMIT'), ' ', printNode(limit)]);
    if (offset) parts.push([makeKeyword('OFFSET'), ' ', printNode(offset)]);

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// CREATE RULE
// ---------------------------------------------------------------------------

function printRule(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const ruleName = propStr(node, 'ruleName') ?? '';
    const relation = prop(node, 'relation');
    const event    = propStr(node, 'event') ?? 'SELECT';
    const instead  = propBool(node, 'instead');
    const doInstead = propBool(node, 'doInstead');
    const where    = prop(node, 'where');
    const actions  = propArr(node, 'actions');

    const parts: Doc[] = [];
    parts.push([makeKeyword('CREATE RULE'), ' ', ruleName]);
    parts.push([makeKeyword('AS ON'), ' ', makeKeyword(event)]);
    parts.push([makeKeyword('TO'), ' ', rangeVarName(relation)]);

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    const doKw: Doc = instead ? makeKeyword('DO INSTEAD') : doInstead ? makeKeyword('DO ALSO') : makeKeyword('DO ALSO');

    if (actions.length === 0) {
        parts.push([doKw, ' ', makeKeyword('NOTHING')]);
    } else if (actions.length === 1) {
        const action = actions[0]!;
        if (action.type === 'NothingStmt') {
            parts.push([doKw, ' ', makeKeyword('NOTHING')]);
        } else {
            parts.push([doKw, indent([hardline, printQueryExpr(action, opts)])]);
        }
    } else {
        const actionDocs = actions.map((a) =>
            a.type === 'NothingStmt' ? makeKeyword('NOTHING') : printQueryExpr(a, opts)
        );
        parts.push([doKw, ' (', indent([hardline, join([';', hardline], actionDocs)]), hardline, ')']);
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// Row Security Policies
// ---------------------------------------------------------------------------

function printCreatePolicy(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const policyName = propStr(node, 'policyName') ?? '';
    const table    = prop(node, 'table');
    const cmdName  = propStr(node, 'cmdName');
    const permissive = node.props?.['permissive'];  // false = RESTRICTIVE, null = PERMISSIVE (default)
    const using    = prop(node, 'using');
    const withCheck = prop(node, 'withCheck');

    const parts: Doc[] = [];
    parts.push([makeKeyword('CREATE POLICY'), ' ', policyName]);

    const onPart: Doc = permissive === false
        ? [makeKeyword('AS'), ' ', makeKeyword('RESTRICTIVE'), ' ', makeKeyword('ON'), ' ', rangeVarName(table)]
        : [makeKeyword('ON'), ' ', rangeVarName(table)];
    parts.push(onPart);

    if (cmdName) parts.push([makeKeyword('FOR'), ' ', makeKeyword(cmdName)]);
    if (using) parts.push([makeKeyword('USING'), ' (', printNode(using), ')']);
    if (withCheck) parts.push([makeKeyword('WITH CHECK'), ' (', printNode(withCheck), ')']);

    return [join(hardline, parts), ';'];
}

function printAlterPolicy(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const policyName = propStr(node, 'policyName') ?? '';
    const table    = prop(node, 'table');
    const using    = prop(node, 'using');
    const withCheck = prop(node, 'withCheck');

    const parts: Doc[] = [];
    parts.push([makeKeyword('ALTER POLICY'), ' ', policyName]);
    parts.push([makeKeyword('ON'), ' ', rangeVarName(table)]);
    if (using) parts.push([makeKeyword('USING'), ' (', printNode(using), ')']);
    if (withCheck) parts.push([makeKeyword('WITH CHECK'), ' (', printNode(withCheck), ')']);

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

function printDeclareCursor(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const scroll   = propBool(node, 'scroll');
    const noScroll = propBool(node, 'noScroll');
    const insensitive = propBool(node, 'insensitive');
    const binary   = propBool(node, 'binary');
    const query    = prop(node, 'query');

    const scrollKw: Doc = noScroll ? [' ', makeKeyword('NO SCROLL')] : scroll ? [' ', makeKeyword('SCROLL')] : '';
    const binaryKw: Doc = binary ? [makeKeyword('BINARY'), ' '] : '';
    const insensKw: Doc = insensitive ? [makeKeyword('INSENSITIVE'), ' '] : '';

    return [
        [makeKeyword('DECLARE'), ' ', name, scrollKw, ' ', insensKw, binaryKw, makeKeyword('CURSOR'), ' ', makeKeyword('FOR')],
        hardline,
        query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

function printFetch(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (k: string) => keyword(k, opts);
    const direction = propStr(node, 'direction') ?? 'NEXT';
    const count     = node.props?.['count'] as number | undefined;
    const cursor    = propStr(node, 'cursor') ?? '';
    const isMove    = propBool(node, 'isMove');

    const verb: Doc = isMove ? makeKeyword('MOVE') : makeKeyword('FETCH');

    let dirDoc: Doc;
    if (count !== undefined && count !== null && direction !== 'ALL') {
        // FETCH FORWARD 10 / FETCH ABSOLUTE 5 etc.
        dirDoc = [makeKeyword(direction), ' ', String(count)];
    } else {
        dirDoc = makeKeyword(direction);
    }

    return [[verb, ' ', dirDoc, ' ', makeKeyword('FROM'), ' ', cursor], ';'];
}

function printClosePortal(node: SqlNode, opts: Options): Doc {
    const makeKeyword     = (k: string) => keyword(k, opts);
    const cursor = propStr(node, 'cursor');
    return [[makeKeyword('CLOSE'), ' ', cursor ?? makeKeyword('ALL')], ';'];
}

// ---------------------------------------------------------------------------
// COPY
// ---------------------------------------------------------------------------

function printCopy(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const relation = prop(node, 'relation');
    const query    = prop(node, 'query');
    const columns  = (node.props?.['columns'] as string[] | undefined) ?? [];
    const isFrom   = propBool(node, 'isFrom');
    const isProgram = propBool(node, 'isProgram');
    const filename = propStr(node, 'filename');
    const options  = (node.props?.['options'] as Array<{ name: string; value: string }> | undefined) ?? [];

    const colsPart: Doc = columns.length > 0 ? [' (', join(', ', columns), ')'] : '';

    let sourceDest: Doc;
    if (relation) {
        sourceDest = [rangeVarName(relation), colsPart];
    } else if (query) {
        sourceDest = ['(', indent([hardline, printQueryExpr(query, opts)]), hardline, ')'];
    } else {
        sourceDest = '';
    }

    const dirKw = isFrom ? makeKeyword('FROM') : makeKeyword('TO');
    let dest: Doc;
    if (isProgram && filename) {
        dest = [makeKeyword('PROGRAM'), ' ', `'${filename}'`];
    } else if (filename) {
        dest = `'${filename}'`;
    } else {
        dest = makeKeyword('STDOUT');
    }

    let optionPart: Doc = '';
    if (options.length > 0) {
        const optDocs = options.map((o): Doc => {
            const val = o.value ?? '';
            // Quote if not already quoted, not a boolean, and not a plain identifier
            const fmtVal = val.startsWith("'") || val === 'true' || val === 'false'
                ? val
                : /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val) ? val : `'${val.replace(/'/g, "''")}'`;
            return [makeKeyword(o.name.toUpperCase()), ' ', fmtVal];
        });
        optionPart = [' (', join(', ', optDocs), ')'];
    }

    return [[makeKeyword('COPY'), ' ', sourceDest, ' ', dirKw, ' ', dest, optionPart], ';'];
}

// ---------------------------------------------------------------------------
// EXPLAIN
// ---------------------------------------------------------------------------

function printExplain(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const query   = prop(node, 'query');
    const options  = (node.props?.['options'] as Array<{ name: string; value: string }> | undefined) ?? [];

    // Simple cases: no options at all, or just ANALYZE
    const analyzeOnly = options.length === 1 && options[0]!.name === 'analyze';
    const verboseOnly = options.length === 1 && options[0]!.name === 'verbose';

    if (options.length === 0) {
        return [[makeKeyword('EXPLAIN'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    if (analyzeOnly) {
        return [[makeKeyword('EXPLAIN'), ' ', makeKeyword('ANALYZE'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    if (verboseOnly) {
        return [[makeKeyword('EXPLAIN'), ' ', makeKeyword('VERBOSE'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    const optDocs = options.map((o) => {
        const val = o.value === 'true' ? makeKeyword('true') : o.value === 'false' ? makeKeyword('false') : o.value;
        return [makeKeyword(o.name.toUpperCase()), ' ', val] as Doc;
    });

    return [[makeKeyword('EXPLAIN'), ' (', join(', ', optDocs), ') ', query ? printQueryExpr(query, opts) : ''], ';'];
}

// ---------------------------------------------------------------------------
// PREPARE / EXECUTE / DEALLOCATE
// ---------------------------------------------------------------------------

function printPrepare(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const query    = prop(node, 'query');

    const argsPart: Doc = argTypes.length > 0
        ? ['(', join(', ', argTypes.map((t) => makeKeyword(t))), ')']
        : '';

    return [
        [makeKeyword('PREPARE'), ' ', name, argsPart, ' ', makeKeyword('AS')],
        hardline,
        query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

function printExecute(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const name    = propStr(node, 'name') ?? '';
    const params  = propArr(node, 'params');

    const paramsPart: Doc = params.length > 0
        ? ['(', join(', ', params.map(printNode)), ')']
        : '';

    return [[makeKeyword('EXECUTE'), ' ', name, paramsPart], ';'];
}

function printDeallocate(node: SqlNode, opts: Options): Doc {
    const makeKeyword   = (k: string) => keyword(k, opts);
    const name = propStr(node, 'name');
    return [[makeKeyword('DEALLOCATE'), ' ', name ? name : makeKeyword('ALL')], ';'];
}

// ---------------------------------------------------------------------------
// LISTEN / UNLISTEN / NOTIFY
// ---------------------------------------------------------------------------

function printListen(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel') ?? '';
    return [[makeKeyword('LISTEN'), ' ', channel], ';'];
}

function printUnlisten(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel');
    return [[makeKeyword('UNLISTEN'), ' ', channel ? channel : '*'], ';'];
}

function printNotify(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel') ?? '';
    const payload = propStr(node, 'payload');
    const payloadPart: Doc = payload ? [', ', `'${payload}'`] : '';
    return [[makeKeyword('NOTIFY'), ' ', channel, payloadPart], ';'];
}

// ---------------------------------------------------------------------------
// LOCK TABLE
// ---------------------------------------------------------------------------

function printLockTable(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (k: string) => keyword(k, opts);
    const relations = propArr(node, 'relations');
    const mode      = propStr(node, 'mode') ?? 'ACCESS EXCLUSIVE';
    const nowait    = propBool(node, 'nowait');

    return [
        makeKeyword('LOCK TABLE'), ' ', join(', ', relations.map(rangeVarName)),
        ' ', makeKeyword('IN'), ' ', makeKeyword(mode), ' ', makeKeyword('MODE'),
        nowait ? [' ', makeKeyword('NOWAIT')] : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: CREATE TABLE PARTITION OF
// ---------------------------------------------------------------------------

function printCreateTablePartitionOf(node: SqlNode, opts: Options): Doc {
    const makeKeyword     = (k: string) => keyword(k, opts);
    const name   = prop(node, 'name');
    const parent = prop(node, 'parent');
    const bound  = prop(node, 'bound');

    let boundDoc: Doc = '';
    if (bound) {
        const isDefault  = propBool(bound, 'isDefault');
        const lower      = (bound.props?.['lower']      as string[] | undefined) ?? [];
        const upper      = (bound.props?.['upper']      as string[] | undefined) ?? [];
        const listDatums = (bound.props?.['listDatums'] as string[] | undefined) ?? [];
        const modulus    = bound.props?.['modulus']  as number | undefined;
        const remainder  = bound.props?.['remainder'] as number | undefined;

        if (isDefault) {
            boundDoc = [hardline, makeKeyword('DEFAULT')];
        } else if (lower.length > 0 || upper.length > 0) {
            boundDoc = [
                hardline, makeKeyword('FOR VALUES FROM'),
                ' (', join(', ', lower), ')',
                ' ', makeKeyword('TO'),
                ' (', join(', ', upper), ')',
            ];
        } else if (listDatums.length > 0) {
            boundDoc = [hardline, makeKeyword('FOR VALUES IN'), ' (', join(', ', listDatums), ')'];
        } else if (modulus !== undefined && remainder !== undefined) {
            boundDoc = [hardline, makeKeyword('FOR VALUES WITH'), ' (', makeKeyword('MODULUS'), ' ', String(modulus), ', ', makeKeyword('REMAINDER'), ' ', String(remainder), ')'];
        }
    }

    return [
        makeKeyword('CREATE TABLE'), ' ', rangeVarName(name), hardline,
        indent([makeKeyword('PARTITION OF'), ' ', rangeVarName(parent)]),
        boundDoc,
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: VACUUM / ANALYZE / CLUSTER / REINDEX
// ---------------------------------------------------------------------------

function printVacuum(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (k: string) => keyword(k, opts);
    const isVacuum  = propBool(node, 'isVacuum');
    const options   = (node.props?.['options'] as string[] | undefined) ?? [];
    const relations = propArr(node, 'relations');

    const relDoc: Doc = relations.length > 0
        ? [' ', join(', ', relations.map(rangeVarName))]
        : '';

    if (!isVacuum) {
        return [[makeKeyword('ANALYZE'), relDoc], ';'];
    }

    if (options.length === 0) {
        return [[makeKeyword('VACUUM'), relDoc], ';'];
    }
    if (options.length === 1 && (options[0] === 'VERBOSE' || options[0] === 'ANALYZE')) {
        return [[makeKeyword('VACUUM'), ' ', makeKeyword(options[0]!), relDoc], ';'];
    }
    return [[makeKeyword('VACUUM'), ' (', join(', ', options.map((o) => makeKeyword(o.toLowerCase()))), ')', relDoc], ';'];
}

function printCluster(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const relation = prop(node, 'relation');
    const indexName = propStr(node, 'indexName');

    return [
        [makeKeyword('CLUSTER'), ' ', rangeVarName(relation),
         indexName ? [' ', makeKeyword('USING'), ' ', indexName] : ''],
        ';',
    ];
}

function printReindex(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const kind     = propStr(node, 'kind') ?? 'TABLE';
    const relation = prop(node, 'relation');
    const options  = (node.props?.['options'] as string[] | undefined) ?? [];

    const optDoc: Doc = options.length > 0
        ? [' (', join(', ', options.map((o) => makeKeyword(o.toLowerCase()))), ')']
        : '';

    return [
        [makeKeyword('REINDEX'), optDoc, ' ', makeKeyword(kind), ' ', rangeVarName(relation)],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Foreign Data Wrappers
// ---------------------------------------------------------------------------

function printFdwOptions(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const options = propArr(node, 'options');
    if (options.length === 0) return '';
    const pairs = options.map((o) => {
        const key = propStr(o, 'key') ?? '';
        const val = propStr(o, 'val') ?? '';
        return [key, " '", val, "'"].join('') as Doc;
    });
    return [' ', makeKeyword('OPTIONS'), ' (', join(', ', pairs), ')'];
}

function printCreateForeignServer(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const fdwName = propStr(node, 'fdwName') ?? '';

    return [
        [makeKeyword('CREATE SERVER'), ' ', name, hardline,
         indent([makeKeyword('FOREIGN DATA WRAPPER'), ' ', fdwName]),
         printFdwOptions(node, opts)],
        ';',
    ];
}

function printCreateForeignTable(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const printNode  = printWith(opts);
    const name       = prop(node, 'name');
    const columns    = propArr(node, 'columns');
    const serverName = propStr(node, 'serverName') ?? '';

    return [
        makeKeyword('CREATE FOREIGN TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ')',
        hardline, indent([makeKeyword('SERVER'), ' ', serverName]),
        printFdwOptions(node, opts),
        ';',
    ];
}

function printCreateUserMapping(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const user       = propStr(node, 'user') ?? '';
    const serverName = propStr(node, 'serverName') ?? '';

    return [
        [makeKeyword('CREATE USER MAPPING FOR'), ' ', makeKeyword(user), hardline,
         indent([makeKeyword('SERVER'), ' ', serverName]),
         printFdwOptions(node, opts)],
        ';',
    ];
}

function printImportForeignSchema(node: SqlNode, opts: Options): Doc {
    const makeKeyword           = (k: string) => keyword(k, opts);
    const remoteSchema = propStr(node, 'remoteSchema') ?? '';
    const serverName   = propStr(node, 'serverName') ?? '';
    const localSchema  = propStr(node, 'localSchema') ?? '';

    return [
        [makeKeyword('IMPORT FOREIGN SCHEMA'), ' ', remoteSchema, hardline,
         makeKeyword('FROM SERVER'), ' ', serverName, hardline,
         makeKeyword('INTO'), ' ', localSchema],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Logical Replication
// ---------------------------------------------------------------------------

function printCreatePublication(node: SqlNode, opts: Options): Doc {
    const makeKeyword     = (k: string) => keyword(k, opts);
    const name   = propStr(node, 'name') ?? '';
    const tables = propArr(node, 'tables');
    const forAll = propBool(node, 'forAllTables');

    let forPart: Doc;
    if (forAll) {
        forPart = [' ', makeKeyword('FOR ALL TABLES')];
    } else if (tables.length > 0) {
        forPart = [hardline, indent([makeKeyword('FOR TABLE'), ' ', join(', ', tables.map(rangeVarName))])];
    } else {
        forPart = '';
    }

    return [[makeKeyword('CREATE PUBLICATION'), ' ', name, forPart], ';'];
}

function printCreateSubscription(node: SqlNode, opts: Options): Doc {
    const makeKeyword           = (k: string) => keyword(k, opts);
    const name         = propStr(node, 'name') ?? '';
    const conninfo     = propStr(node, 'conninfo') ?? '';
    const publications = (node.props?.['publications'] as string[] | undefined) ?? [];

    return [
        [makeKeyword('CREATE SUBSCRIPTION'), ' ', name, hardline,
         indent([makeKeyword('CONNECTION'), " '", conninfo, "'"]), hardline,
         indent([makeKeyword('PUBLICATION'), ' ', join(', ', publications)])],
        ';',
    ];
}

function printDropSubscription(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');

    return [
        [makeKeyword('DROP SUBSCRIPTION'), ifExists ? [' ', makeKeyword('IF EXISTS')] : '', ' ', name],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: CREATE AGGREGATE / OPERATOR / COLLATION
// ---------------------------------------------------------------------------

function printDefOptions(options: SqlNode[], _opts: Options): Doc {
    return join([',', hardline], options.map((o) => {
        const key = propStr(o, 'key') ?? '';
        const val = propStr(o, 'val');
        return val ? [key, ' = ', val] as Doc : [key] as Doc;
    }));
}

function printCreateAggregate(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const options  = propArr(node, 'options');

    return [
        makeKeyword('CREATE AGGREGATE'), ' ', name, ' (', join(', ', argTypes.map((t) => makeKeyword(t))), ') (',
        indent([hardline, printDefOptions(options, opts)]),
        hardline, ');',
    ];
}

function printCreateOperator(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const options = propArr(node, 'options');

    return [
        makeKeyword('CREATE OPERATOR'), ' ', name, ' (',
        indent([hardline, printDefOptions(options, opts)]),
        hardline, ');',
    ];
}

function printCreateCollation(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const fromName = propStr(node, 'fromName');
    const options  = propArr(node, 'options');

    if (fromName) {
        return [[makeKeyword('CREATE COLLATION'), ' ', name, ' ', makeKeyword('FROM'), ' ', `"${fromName}"`], ';'];
    }

    return [
        makeKeyword('CREATE COLLATION'), ' ', name, ' (',
        printDefOptions(options, opts),
        ');',
    ];
}

// ---------------------------------------------------------------------------
// P4: Security Labels
// ---------------------------------------------------------------------------

function printSecurityLabel(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const provider = propStr(node, 'provider') ?? '';
    const objType  = propStr(node, 'objType') ?? 'table';
    const objName  = propStr(node, 'objName') ?? '';
    const label    = propStr(node, 'label') ?? '';

    return [
        [makeKeyword('SECURITY LABEL FOR'), ' ', provider, ' ', makeKeyword('ON'), ' ', makeKeyword(objType), ' ', objName, ' ', makeKeyword('IS'), " '", label, "'"],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// DBA / utility statements
// ---------------------------------------------------------------------------

function printDiscard(node: SqlNode, opts: Options): Doc {
    const target = propStr(node, 'target') ?? 'ALL';
    return [[keyword('DISCARD', opts), ' ', keyword(target, opts)], ';'];
}

function printLoad(node: SqlNode, opts: Options): Doc {
    const filename = propStr(node, 'filename') ?? '';
    return [[keyword('LOAD', opts), ` '${filename}'`], ';'];
}

function printAlterSystem(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const kind   = propStr(node, 'kind') ?? 'SET';
    const name   = propStr(node, 'name') ?? '';
    const values = propStrArr(node, 'values');

    if (kind === 'RESET ALL') return [[makeKeyword('ALTER SYSTEM RESET ALL')], ';'];
    if (kind === 'RESET')     return [[makeKeyword('ALTER SYSTEM RESET'), ' ', name], ';'];

    const valDocs: Doc[] = values.map((v) => {
        if (/^[0-9]/.test(v) || /[^a-zA-Z0-9_$]/.test(v)) return `'${v.replace(/'/g, "''")}'`;
        return v.toLowerCase();
    });
    return [[makeKeyword('ALTER SYSTEM SET'), ' ', name, ' = ', join(', ', valDocs)], ';'];
}

function printReassignOwned(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const roles   = (node.props?.['roles'] as string[] | undefined) ?? [];
    const newRole = propStr(node, 'newRole') ?? '';
    return [[makeKeyword('REASSIGN OWNED BY'), ' ', join(', ', roles), ' ', makeKeyword('TO'), ' ', newRole], ';'];
}

function printDropOwned(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const roles    = (node.props?.['roles'] as string[] | undefined) ?? [];
    const behavior = propStr(node, 'behavior');
    const parts: Doc[] = [makeKeyword('DROP OWNED BY'), ' ', join(', ', roles)];
    if (behavior) parts.push(' ', makeKeyword(behavior));
    return [parts, ';'];
}

function printCreateTableSpace(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const location = propStr(node, 'location') ?? '';
    const owner    = propStr(node, 'owner');
    const parts: Doc[] = [makeKeyword('CREATE TABLESPACE'), ' ', name];
    if (owner) parts.push(' ', makeKeyword('OWNER'), ' ', owner);
    parts.push(hardline, indent([makeKeyword('LOCATION'), ' ', `'${location}'`]));
    return [parts, ';'];
}

function printDropTableSpace(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [[makeKeyword('DROP TABLESPACE'), ifExists ? [' ', makeKeyword('IF EXISTS')] : '', ' ', name], ';'];
}
