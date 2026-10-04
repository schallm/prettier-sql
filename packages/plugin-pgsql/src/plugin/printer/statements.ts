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
import { prop, propArr, propStr, propBool, propStrArr, rangeVarName, qualifiedName, onlyPrefix, printFdwOptions } from './helpers.js';
import { printExpression, printPartitionBound, printAssignTarget, printAssignment, printWindowDef, printOperand, printBoolFlat, PREC, tableAliasDoc } from './expressions.js';

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
    if (statements.length === 0) {
        const comments = propStrArr(node, 'comments');
        return comments.length > 0 ? [join(hardline, comments), hardline] : '';
    }
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
        case 'AlterPublicationStatement':      return printAlterPublication(node, opts);
        case 'CreateSubscriptionStatement':    return printCreateSubscription(node, opts);
        case 'AlterSubscriptionStatement':     return printAlterSubscription(node, opts);
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
        // Passthrough: AstBuilder extracted the original SQL text verbatim so it is not lost.
        case 'UnknownStatement': return [node.text ?? `/* unknown statement: ${node.type} */`, ';'];
        default: return [node.text ?? `/* unknown: ${node.type} */`, ';'];
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
        // A nested VALUES list — `(values (1), (2)) as v(x)` — without the leading
        // line break it takes after INSERT INTO t
        case 'ValuesStatement': return stripLeadingHardline(printValuesRows(node, opts, printWith(opts)));
        // These statement kinds only ever appear nested (WITH cte AS (...), COPY
        // (...) TO ..., PREPARE ... AS ..., EXPLAIN ...) via their full top-level
        // printer, which always ends with a trailing ';' meant for the standalone
        // form — strip it here rather than duplicating each printer as a *Body
        // variant.
        case 'MergeStatement':          return stripTrailingSemicolon(printMerge(node, opts));
        case 'CreateTableAsStatement':  return stripTrailingSemicolon(printCreateTableAs(node, opts));
        case 'CreateMatViewStatement':  return stripTrailingSemicolon(printCreateMatView(node, opts));
        case 'RefreshMatViewStatement': return stripTrailingSemicolon(printRefreshMatView(node, opts));
        case 'DeclareCursorStatement':  return stripTrailingSemicolon(printDeclareCursor(node, opts));
        case 'ExecuteStatement':        return stripTrailingSemicolon(printExecute(node, opts));
        default:                return printSelectBody(node, opts);
    }
}

function stripLeadingHardline(doc: Doc): Doc {
    return Array.isArray(doc) && doc[0] === hardline ? doc.slice(1) : doc;
}

/** Drops the trailing ';' a top-level statement printer always appends, for reuse
 *  in a nested "query" position (WITH/COPY/PREPARE/EXPLAIN) where no semicolon belongs. */
function stripTrailingSemicolon(doc: Doc): Doc {
    return Array.isArray(doc) && doc.length > 0 && doc[doc.length - 1] === ';' ? doc.slice(0, -1) : doc;
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
        const prec = op === 'OR' ? PREC.OR : PREC.AND;
        const fillParts: Doc[] = [printOperand(args[0]!, prec, printNode)];
        for (let i = 1; i < args.length; i++) {
            fillParts.push(line);
            fillParts.push([makeKeyword(op), ' ', printOperand(args[i]!, prec, printNode)]);
        }
        return [makeKeyword(kw), group([indent([line, fill(fillParts)])])];
    }

    return [makeKeyword(kw), indent([hardline, printBoolFlat(where, opts, printNode)])];
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
        const columns = propStrArr(cte, 'columns');
        const materialized = propStr(cte, 'materialized');
        const query = prop(cte, 'query');
        const search = prop(cte, 'search');
        const cycle  = prop(cte, 'cycle');
        const parts: Doc[] = [name, columns.length > 0 ? ['(', join(', ', columns), ')'] : '', ' ', makeKeyword('AS'),
            materialized ? [' ', makeKeyword(materialized)] : '', ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
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

    // GROUP BY DISTINCT drops duplicate grouping sets (ROLLUP / CUBE / GROUPING SETS)
    const groupByKw = propBool(node, 'groupDistinct') ? 'GROUP BY DISTINCT' : 'GROUP BY';
    if (groupBy.length > 0) parts.push(printListClause(groupByKw, groupBy, opts, printNode));

    if (having) parts.push(printBoolClause('HAVING', having, opts, printNode));

    // Named WINDOW clauses: WINDOW w AS (PARTITION BY ... ORDER BY ...)
    const windowClauses = propArr(node, 'windowClauses');
    if (windowClauses.length > 0) {
        const wDocs = windowClauses.map((w) => {
            const wName = propStr(w, 'name') ?? '';
            const wSpec = printWindowDef(w, opts, printNode);
            return [wName, ' ', makeKeyword('AS'), ' ', wSpec];
        });
        parts.push([makeKeyword('WINDOW'), indent([hardline, join(hardSep(opts), wDocs)])]);
    }

    parts.push(...printQueryTail(node, opts, printNode));

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
        ? group([' (', indent([softline, join(softSep(opts), columns.map((c) => printAssignTarget(c, printNode)))]), softline, ')'])
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
        [makeKeyword('INSERT INTO'), ' ', rangeVarName(target), target ? tableAliasDoc(target, opts) : '', colsPart, overridePart, sourcePart],
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

    const setDocs = sets.map((s) => printAssignment(s, printNode));

    const parts: Doc[] = ctes ? printCtes(ctes, opts, printNode) : [];
    parts.push(
        [makeKeyword('UPDATE'), ' ', onlyPrefix(target, opts), rangeVarName(target), target ? tableAliasDoc(target, opts) : ''],
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
    parts.push([makeKeyword('DELETE FROM'), ' ', onlyPrefix(target, opts), rangeVarName(target), target ? tableAliasDoc(target, opts) : '']);

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

/**
 * ORDER BY, LIMIT/OFFSET (or FETCH FIRST … WITH TIES) and locking clauses, which end
 * a SELECT, a set operation or VALUES.
 */
function printQueryTail(node: SqlNode, opts: Options, printNode: PrintFn): Doc[] {
    const makeKeyword = (k: string) => keyword(k, opts);
    const orderBy = propArr(node, 'orderBy');
    const limit   = prop(node, 'limit');
    const offset  = prop(node, 'offset');
    const parts: Doc[] = [];

    if (orderBy.length > 0) parts.push(printListClause('ORDER BY', orderBy, opts, printNode));

    if (propBool(node, 'withTies')) {
        // WITH TIES has no LIMIT spelling
        if (offset) parts.push([makeKeyword('OFFSET'), ' ', printNode(offset), ' ', makeKeyword('ROWS')]);
        if (limit) parts.push([makeKeyword('FETCH FIRST'), ' ', printNode(limit), ' ', makeKeyword('ROWS WITH TIES')]);
    } else {
        if (limit)  parts.push([makeKeyword('LIMIT'), ' ', printNode(limit)]);
        if (offset) parts.push([makeKeyword('OFFSET'), ' ', printNode(offset)]);
    }

    for (const lc of propArr(node, 'locking')) {
        const strength   = propStr(lc, 'strength') ?? 'FOR UPDATE';
        const tables     = propArr(lc, 'tables');
        const waitPolicy = propStr(lc, 'waitPolicy');
        const ofPart: Doc = tables.length > 0
            ? [' ', makeKeyword('OF'), ' ', join(', ', tables.map((t) => rangeVarName(t)))]
            : '';
        const waitPart: Doc = waitPolicy ? [' ', makeKeyword(waitPolicy)] : '';
        parts.push([makeKeyword(strength), ofPart, waitPart]);
    }
    return parts;
}

/** True when a query has clauses of its own that, unparenthesized, would bind to an enclosing set operation. */
function hasQueryClauses(node: SqlNode): boolean {
    return !!prop(node, 'ctes') || propArr(node, 'orderBy').length > 0 || !!prop(node, 'limit')
        || !!prop(node, 'offset') || propArr(node, 'locking').length > 0;
}

// INTERSECT binds tighter than UNION and EXCEPT
const setOpPrecedence = (node: SqlNode): number => (propStr(node, 'op') === 'INTERSECT' ? 2 : 1);

function printSetOpBody(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode   = printWith(opts);
    const op    = propStr(node, 'op') ?? 'UNION';
    const all   = propBool(node, 'all');
    const lhs   = prop(node, 'lhs');
    const rhs   = prop(node, 'rhs');
    const opKw  = all ? makeKeyword(`${op} ALL`) : makeKeyword(op);

    // An operand needs parentheses when its own ORDER BY/LIMIT/WITH would otherwise
    // apply to the whole result, or when it's a set operation that wouldn't group
    // this way unparenthesized: set operations associate left, and INTERSECT binds
    // tighter than UNION/EXCEPT.
    const operand = (child: SqlNode | null | undefined, side: 'lhs' | 'rhs'): Doc => {
        if (!child) return '';
        const isSetOp = child.type === 'SetOpStatement';
        const needsParens = hasQueryClauses(child)
            || (isSetOp && (side === 'rhs'
                ? setOpPrecedence(child) <= setOpPrecedence(node)
                : setOpPrecedence(child) < setOpPrecedence(node)));
        const doc = printQueryExpr(child, opts);
        return needsParens ? ['(', indent([hardline, doc]), hardline, ')'] : doc;
    };

    const parts: Doc[] = [];
    const ctes = prop(node, 'ctes');
    if (ctes) parts.push(...printCtes(ctes, opts, printNode));
    parts.push([operand(lhs, 'lhs'), hardline, opKw, hardline, operand(rhs, 'rhs')]);
    parts.push(...printQueryTail(node, opts, printNode));
    return join(hardline, parts);
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

    // VALUES (1), (2) ORDER BY 1 LIMIT 1
    const tail: Doc[] = printQueryTail(node, opts, printNode).map((d) => [hardline, d]);
    // WITH c AS (...) VALUES (...): the CTEs come first
    const ctes = prop(node, 'ctes');
    // Flat, so the doc still starts with the hardline stripLeadingHardline removes
    const head: Doc[] = ctes ? printCtes(ctes, opts, printNode).flatMap((d) => [hardline, d]) : [];

    if (rowDocs.length === 1) {
        return [...head, hardline, makeKeyword('VALUES'), ' ', rowDocs[0]!, tail];
    }

    const density  = getDensity(opts);
    const colCount = propArr(rows[0]!, 'items').length;
    // compact: fill-pack all multi-row inserts
    // standard + 1-column rows: fill-pack (rows are short)
    // standard + multi-column rows: one per line
    // spacious: always one per line
    const useFill = density === 'compact' || (density === 'standard' && colCount === 1);
    return [...head, hardline, makeKeyword('VALUES'), indent([hardline, useFill ? fillList(rowDocs, opts) : join(hardSep(opts), rowDocs)]), tail];
}

function printValues(node: SqlNode, opts: Options): Doc {
    // Standalone, without the line break it takes after INSERT INTO t
    return [stripLeadingHardline(printValuesRows(node, opts, printWith(opts))), ';'];
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
            // Full index elements: an expression target such as (lower(email)) or a
            // collation/opclass has to match the unique index being inferred
            targetDoc = group([' (', indent([softline, join(softSep(opts), cols.map(printNode))]), softline, ')']);
            const inferWhere = prop(target, 'where');
            if (inferWhere) targetDoc = [targetDoc, ' ', makeKeyword('WHERE'), ' ', printNode(inferWhere)];
        }
    }

    if (action === 'NOTHING') {
        return [makeKeyword('ON CONFLICT'), targetDoc, ' ', makeKeyword('DO NOTHING')];
    }

    // DO UPDATE SET
    const setDocs = sets.map((s) => printAssignment(s, printNode));

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
    const ofType = propStr(node, 'ofType');

    const inherits = propArr(node, 'inherits');
    const partitionDoc: Doc = partitionBy
        ? [hardline, makeKeyword('PARTITION BY'), ' ', makeKeyword(propStr(partitionBy, 'strategy') ?? 'RANGE'),
           ' (', join(', ', propArr(partitionBy, 'elements').map(printNode)), ')']
        : '';

    return [
        createTableKeyword(node, opts), ' ', ifNotExistsDoc(node, opts), rangeVarName(name),
        ofType ? [' ', makeKeyword('OF'), ' ', ofType] : '',
        columns.length > 0 || !ofType
            ? [' (', indent([hardline, join([',', hardline], columns.map(printNode))]), hardline, ')']
            : '',
        inherits.length > 0 ? [hardline, makeKeyword('INHERITS'), ' (', join(', ', inherits.map(rangeVarName)), ')'] : '',
        partitionDoc,
        tableStorageClauses(node, opts),
        ';',
    ];
}

/** `CREATE [TEMPORARY | UNLOGGED] TABLE` */
function createTableKeyword(node: SqlNode, opts: Options): Doc {
    const persistence = propStr(node, 'persistence');
    return keyword(persistence ? `CREATE ${persistence} TABLE` : 'CREATE TABLE', opts);
}

function ifNotExistsDoc(node: SqlNode, opts: Options): Doc {
    return propBool(node, 'ifNotExists') ? [keyword('IF NOT EXISTS', opts), ' '] : '';
}

/** The trailing `USING method`, `WITH (…)`, `ON COMMIT …` and `TABLESPACE …` clauses. */
function tableStorageClauses(node: SqlNode, opts: Options): Doc {
    const makeKeyword  = (k: string) => keyword(k, opts);
    const accessMethod = propStr(node, 'accessMethod');
    const options      = propStrArr(node, 'options');
    const onCommit     = propStr(node, 'onCommit');
    const tablespace   = propStr(node, 'tablespace');
    return [
        accessMethod ? [hardline, makeKeyword('USING'), ' ', accessMethod] : '',
        options.length > 0 ? [hardline, makeKeyword('WITH'), ' (', join(', ', options), ')'] : '',
        onCommit ? [hardline, makeKeyword('ON COMMIT'), ' ', makeKeyword(onCommit)] : '',
        tablespace ? [hardline, makeKeyword('TABLESPACE'), ' ', tablespace] : '',
    ];
}

function printAlterTable(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const name     = prop(node, 'name');
    const commands = propArr(node, 'commands');
    const objType  = propStr(node, 'objType') ?? 'TABLE';
    const ifExists: Doc = propBool(node, 'ifExists') ? [makeKeyword('IF EXISTS'), ' '] : '';
    // A composite type's column commands say ATTRIBUTE, and a type has no ONLY
    const isType = propBool(node, 'attributes');
    const printCmd = (cmd: SqlNode): Doc => (isType ? printAttributeCmd(cmd, opts, printNode) : printNode(cmd));

    return [
        makeKeyword(`ALTER ${objType}`), ' ', ifExists, isType ? '' : onlyPrefix(name, opts), rangeVarName(name),
        indent([hardline, join([',', hardline], commands.map(printCmd))]),
        ';',
    ];
}

/** ALTER TYPE t ADD / DROP / ALTER ATTRIBUTE — the composite-type forms of the column commands. */
function printAttributeCmd(cmd: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const subtype = propStr(cmd, 'subtype');
    const name = propStr(cmd, 'name') ?? '';
    const ifExists: Doc = propBool(cmd, 'ifExists') ? [makeKeyword('IF EXISTS'), ' '] : '';
    const cascade: Doc = propBool(cmd, 'cascade') ? [' ', makeKeyword('CASCADE')] : '';
    const def = prop(cmd, 'def');
    switch (subtype) {
        case 'ADD COLUMN':
            return [makeKeyword('ADD ATTRIBUTE'), ' ', def ? printNode(def) : name, cascade];
        case 'DROP COLUMN':
            return [makeKeyword('DROP ATTRIBUTE'), ' ', ifExists, name, cascade];
        case 'ALTER COLUMN TYPE':
            return [makeKeyword('ALTER ATTRIBUTE'), ' ', name, ' ', makeKeyword('TYPE'), ' ', keyword(propStr(cmd, 'newType') ?? '', opts),
                propStr(cmd, 'collation') ? [' ', makeKeyword('COLLATE'), ' ', propStr(cmd, 'collation')!] : '', cascade];
        default:
            return printNode(cmd);
    }
}

function printCreateView(node: SqlNode, opts: Options): Doc {
    const makeKeyword    = (k: string) => keyword(k, opts);
    const name  = prop(node, 'name');
    const body  = prop(node, 'body');
    const columns = propStrArr(node, 'columns');
    const options = propStrArr(node, 'options');
    const checkOption = propStr(node, 'checkOption');
    const persistence = propStr(node, 'persistence');
    const createKw = ['CREATE', propBool(node, 'orReplace') ? ' OR REPLACE' : '', persistence ? ` ${persistence}` : '', ' VIEW'].join('');

    return [
        makeKeyword(createKw), ' ', rangeVarName(name),
        columns.length > 0 ? [' (', join(', ', columns), ')'] : '',
        options.length > 0 ? [hardline, makeKeyword('WITH'), ' (', join(', ', options), ')'] : '',
        hardline, makeKeyword('AS'), hardline,
        body ? printQueryExpr(body, opts) : '',
        checkOption ? [hardline, makeKeyword(`WITH ${checkOption} CHECK OPTION`)] : '',
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
    const attributes   = propStrArr(node, 'attributes');
    const body         = propStrArr(node, 'body');
    const kind         = propBool(node, 'isProcedure') ? 'PROCEDURE' : 'FUNCTION';

    const parts: Doc[] = [
        makeKeyword(propBool(node, 'orReplace') ? `CREATE OR REPLACE ${kind}` : `CREATE ${kind}`), ' ', name,
        '(', join(', ', parameters.map(printNode)), ')',
    ];

    if (returnsTable.length > 0) {
        parts.push(hardline, makeKeyword('RETURNS TABLE'), ' (', join(', ', returnsTable.map(printNode)), ')');
    } else if (returnType) {
        parts.push(hardline, makeKeyword('RETURNS'), ' ', makeKeyword(returnType));
    }
    if (language)   parts.push(hardline, makeKeyword('LANGUAGE'), ' ', language);
    for (const attribute of attributes) parts.push(hardline, makeKeyword(attribute));
    if (body.length === 1) {
        parts.push(hardline, makeKeyword('AS'), ' ', dollarQuote(body[0]!));
    } else if (body.length > 1) {
        // C function: AS 'obj_file', 'link_symbol'
        parts.push(hardline, makeKeyword('AS'), ' ', join(', ', body.map((b) => `'${b.replace(/'/g, "''")}'`)));
    }

    // SQL-standard body: RETURN expr | BEGIN ATOMIC stmt; ... END
    const sqlBody = prop(node, 'sqlBody');
    if (sqlBody) {
        const returnExpr = prop(sqlBody, 'returnExpr');
        if (returnExpr) {
            parts.push(hardline, makeKeyword('RETURN'), ' ', indent(printNode(returnExpr)));
        } else {
            const stmts = propArr(sqlBody, 'statements').map((st): Doc =>
                st.type === 'ReturnStatement'
                    ? [makeKeyword('RETURN'), ' ', printNode(prop(st, 'expr')!), ';']
                    : printStatement(st, opts));
            parts.push(hardline, makeKeyword('BEGIN ATOMIC'),
                stmts.length > 0 ? indent([hardline, join(hardline, stmts)]) : '',
                hardline, makeKeyword('END'));
        }
    }

    return [join('', parts), ';'];
}

/** Dollar-quotes `text` with a tag that doesn't occur in it: $$…$$, else $body$…$body$, $body1$… */
/** A single-quoted SQL string literal, with embedded quotes doubled. */
function sqlString(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

function dollarQuote(text: string): string {
    let tag = '$$';
    for (let i = 0; text.includes(tag); i++) tag = i === 0 ? '$body$' : `$body${i}$`;
    return `${tag}${text}${tag}`;
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
    const options    = propStrArr(node, 'options');
    const tablespace = propStr(node, 'tablespace');
    parts.push(' ', indexName, ' ', makeKeyword('ON'), ' ', onlyPrefix(relation, opts), rangeVarName(relation));
    if (accessMethod) parts.push(' ', makeKeyword('USING'), ' ', accessMethod);
    parts.push(' (', join(', ', columns.map(printNode)), ')');
    if (including.length > 0) parts.push(' ', makeKeyword('INCLUDE'), ' (', join(', ', including.map(printNode)), ')');
    if (propBool(node, 'nullsNotDistinct')) parts.push(' ', makeKeyword('NULLS NOT DISTINCT'));
    if (options.length > 0) parts.push(' ', makeKeyword('WITH'), ' (', join(', ', options), ')');
    if (tablespace) parts.push(' ', makeKeyword('TABLESPACE'), ' ', tablespace);
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
        makeKeyword('TRUNCATE TABLE'), ' ', join(', ', relations.map((r) => [onlyPrefix(r, opts), rangeVarName(r)])),
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
    // DROP TRIGGER tr ON t, DROP OPERATOR CLASS oc USING btree, DROP CAST (a AS b), DROP TRANSFORM FOR t LANGUAGE l
    const onTable       = propStr(node, 'onTable');
    const using         = propStr(node, 'using');
    const castSource    = propStr(node, 'castSource');
    const transformType = propStr(node, 'transformType');

    return [
        makeKeyword('DROP'), ' ', makeKeyword(objectType),
        propBool(node, 'concurrent') ? [' ', makeKeyword('CONCURRENTLY')] : '',
        ifExists ? [' ', makeKeyword('IF EXISTS')] : '',
        names.length > 0 ? [' ', join(', ', names)] : '',
        onTable ? [' ', makeKeyword('ON'), ' ', onTable] : '',
        using ? [' ', makeKeyword('USING'), ' ', using] : '',
        castSource ? [' (', keyword(castSource, opts), ' ', makeKeyword('AS'), ' ', keyword(propStr(node, 'castTarget') ?? '', opts), ')'] : '',
        transformType
            ? [' ', makeKeyword('FOR'), ' ', keyword(transformType, opts), ' ', makeKeyword('LANGUAGE'), ' ', propStr(node, 'transformLanguage') ?? '']
            : '',
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

    if (kind === 'SET TIME ZONE') {
        const precision = propStr(node, 'intervalPrecision');
        const fields    = propStr(node, 'intervalFields');
        return [[makeKeyword('SET'), ' ', localKw, makeKeyword('TIME ZONE'), ' ', makeKeyword('INTERVAL'), precision ?? '', ' ',
                 propStr(node, 'intervalValue') ?? '', fields ? [' ', makeKeyword(fields)] : ''], ';'];
    }

    // Values arrive as SQL text (numbers, bare words, or quoted literals)
    return [[makeKeyword('SET'), ' ', localKw, name, ' = ', join(', ', values)], ';'];
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
    const privs   = propArr(node, 'privs');
    const objtype = propStr(node, 'objtype') ?? '';
    const objects = propArr(node, 'objects');
    const grantees = propStrArr(node, 'grantees');
    const grantOption = propBool(node, 'grantOption');
    const grantedBy  = propStr(node, 'grantedBy');
    const cascade    = propBool(node, 'cascade');

    const privDocs = privs.map((p): Doc => {
        const columns = propStrArr(p, 'columns');
        return [makeKeyword(propStr(p, 'name') ?? ''), columns.length > 0 ? [' (', join(', ', columns), ')'] : ''];
    });
    const privsDoc: Doc = privDocs.length > 0 ? join(', ', privDocs) : makeKeyword('ALL PRIVILEGES');
    const verb: Doc = isGrant ? makeKeyword('GRANT') : makeKeyword('REVOKE');
    const toFrom: Doc = isGrant ? makeKeyword('TO') : makeKeyword('FROM');

    const objectsDoc: Doc = objects.length > 0
        ? join(', ', objects.map(printNode))
        : '';

    const parts: Doc[] = [
        [verb, !isGrant && grantOption ? [' ', makeKeyword('GRANT OPTION FOR')] : '', ' ', privsDoc, ' ',
         makeKeyword('ON'), ' ', makeKeyword(objtype), objectsDoc ? [' ', objectsDoc] : ''],
        [toFrom, ' ', roleListDoc(grantees, opts)],
    ];

    if (isGrant && grantOption) parts.push(makeKeyword('WITH GRANT OPTION'));
    if (grantedBy)              parts.push([makeKeyword('GRANTED BY'), ' ', roleListDoc([grantedBy], opts)]);
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

    const members = propStr(node, 'members');
    if (members !== null) {
        return [[makeKeyword('ALTER GROUP'), ' ', name, ' ', makeKeyword(`${propStr(node, 'membersAction')} USER`), ' ', members], ';'];
    }

    const parts: Doc[] = [[makeKeyword('ALTER ROLE'), ' ', name]];
    if (options.length > 0) parts.push(join(' ', options.map(makeKeyword)));
    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// RENAME (ALTER TABLE ... RENAME / ALTER INDEX ... RENAME / etc.)
// ---------------------------------------------------------------------------

function printRename(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const sub = propStr(node, 'sub');
    const onTable = propStr(node, 'onTable');
    const using = propStr(node, 'using');
    return [
        makeKeyword('ALTER'), ' ', makeKeyword(propStr(node, 'kind') ?? 'TABLE'),
        propBool(node, 'ifExists') ? [' ', makeKeyword('IF EXISTS')] : '',
        propBool(node, 'only') ? [' ', makeKeyword('ONLY')] : '',
        ' ', propStr(node, 'target') ?? '',
        onTable ? [' ', makeKeyword('ON'), ' ', onTable] : '',
        using ? [' ', makeKeyword('USING'), ' ', using] : '',
        ' ', makeKeyword('RENAME'),
        sub ? [' ', makeKeyword(sub), ' ', propStr(node, 'oldName') ?? ''] : '',
        ' ', makeKeyword('TO'), ' ', propStr(node, 'newName') ?? '',
        propBool(node, 'cascade') ? [' ', makeKeyword('CASCADE')] : '',
        ';',
    ];
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
            ? ['(', indent([hardline, join([',', hardline], values.map(sqlString))]), hardline, ')']
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
        ? [' ', isAfter ? makeKeyword('AFTER') : makeKeyword('BEFORE'), ' ', sqlString(neighbor)]
        : '';
    const oldVal = propStr(node, 'oldVal');
    if (oldVal) {
        return [[makeKeyword('ALTER TYPE'), ' ', typeName, ' ', makeKeyword('RENAME VALUE'), ' ', sqlString(oldVal), ' ', makeKeyword('TO'), ' ', sqlString(newVal)], ';'];
    }

    return [[makeKeyword('ALTER TYPE'), ' ', typeName, ' ', makeKeyword('ADD VALUE'), ' ', ifNotExistsDoc, sqlString(newVal), placement], ';'];
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
    const persistence = propStr(node, 'persistence');
    const parts: Doc[] = [[makeKeyword(persistence ? `CREATE ${persistence} SEQUENCE` : 'CREATE SEQUENCE'), ' ', ifNotExistsDoc, qname]];
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
    // Schema elements follow without separators: a ';' would end the CREATE SCHEMA
    const elements = propArr(node, 'elements').map((e) => stripTrailingSemicolon(printStatement(e, opts)));
    return [[makeKeyword('CREATE SCHEMA'), ' ', ifNotExistsDoc, name, authDoc,
        ...elements.map((e) => indent([hardline, e]))], ';'];
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
    const cascade     = propBool(node, 'cascade');

    const ifNotExistsDoc: Doc     = ifNotExists ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
    const schemaDoc: Doc = schema  ? [hardline, makeKeyword('SCHEMA'), ' ', schema]  : '';
    const versionDoc: Doc = version ? [hardline, makeKeyword('VERSION'), ' ', sqlString(version)] : '';
    const cascadeDoc: Doc = cascade ? [hardline, makeKeyword('CASCADE')] : '';
    return [[makeKeyword('CREATE EXTENSION'), ' ', ifNotExistsDoc, name, schemaDoc, versionDoc, cascadeDoc], ';'];
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
    const columns     = propStrArr(node, 'columns');
    const query       = prop(node, 'query');

    const qname = qualifiedName(schema, name);
    const createKw = kw === 'CREATE TABLE' ? createTableKeyword(node, opts) : makeKeyword(kw);
    return [
        createKw, ' ', ifNotExistsDoc(node, opts), qname,
        columns.length > 0 ? [' (', join(', ', columns), ')'] : '',
        tableStorageClauses(node, opts),
        ' ', makeKeyword('AS'),
        hardline, query ? printQueryExpr(query, opts) : '',
        propBool(node, 'withNoData') ? [hardline, makeKeyword('WITH NO DATA')] : '',
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

    const updateOf = propStrArr(node, 'updateOf');
    const fromRelation = prop(node, 'fromRelation');
    const referencing  = propStrArr(node, 'referencing');
    const funcArgs     = propStrArr(node, 'funcArgs');

    const eventDoc: Doc = join([' ', makeKeyword('OR'), ' '], events.map((e): Doc =>
        e === 'UPDATE' && updateOf.length > 0 ? [makeKeyword('UPDATE OF'), ' ', join(', ', updateOf)] : makeKeyword(e)));
    const whenDoc: Doc  = when ? [hardline, makeKeyword('WHEN'), ' (', printNode(when), ')'] : '';
    const createKw = [
        'CREATE',
        propBool(node, 'orReplace') ? ' OR REPLACE' : '',
        propBool(node, 'isConstraint') ? ' CONSTRAINT' : '',
        ' TRIGGER',
    ].join('');

    return [
        makeKeyword(createKw), ' ', name,
        hardline, makeKeyword(timing), ' ', eventDoc, ' ', makeKeyword('ON'), ' ', rangeVarName(relation),
        fromRelation ? [hardline, makeKeyword('FROM'), ' ', rangeVarName(fromRelation)] : '',
        propBool(node, 'deferrable') ? [hardline, makeKeyword('DEFERRABLE')] : '',
        propBool(node, 'initDeferred') ? [hardline, makeKeyword('INITIALLY DEFERRED')] : '',
        referencing.length > 0 ? [hardline, makeKeyword('REFERENCING'), ' ', join(' ', referencing.map(makeKeyword))] : '',
        hardline, makeKeyword(`FOR EACH ${forEach}`),
        whenDoc,
        hardline, makeKeyword('EXECUTE FUNCTION'), ' ', funcName, '(', join(', ', funcArgs), ')',
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
    const tailKw   = propStr(node, 'tailKw');
    const tailName = propStr(node, 'tailName') ?? '';
    // CAST (source AS target) is the one form whose two names sit inside parentheses
    const target: Doc = objtype === 'CAST' ? ['(', object, ' ', makeKeyword('AS'), ' ', tailName, ')']
        : [object, tailKw ? [' ', makeKeyword(tailKw), ' ', tailName] : ''];
    return [[makeKeyword('COMMENT ON'), ' ', makeKeyword(objtype), ' ', target, ' ', makeKeyword('IS'), ' ', commentVal], ';'];
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
    if (gid) parts.push(' ', sqlString(gid));
    if (options.length > 0) parts.push(' ', join(', ', options.map((o) => makeKeyword(o))));
    if (propBool(node, 'chain')) parts.push(' ', makeKeyword('AND CHAIN'));

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
    const language = propStr(node, 'language');
    const body = propStr(node, 'body') ?? '';
    // Standard convention: body first, LANGUAGE after (plpgsql when omitted)
    return [[makeKeyword('DO'), ' ', dollarQuote(body), language ? [hardline, makeKeyword('LANGUAGE'), ' ', language] : ''], ';'];
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
            const assignments: Doc[] = targets.map((t) => printAssignment(t, printNode));
            actionDoc = [makeKeyword('UPDATE SET'), indent([hardline, join(hardSep(opts), assignments)])];
        } else { // INSERT
            const cols = targets.filter((t) => t.type === 'ResTarget').map((t) => printAssignTarget(t, printNode));
            const colList: Doc = cols.length > 0 ? [' (', join(', ', cols), ')'] : '';
            const valList: Doc = values.length > 0
                ? [makeKeyword('VALUES'), ' (', join(', ', values.map(printNode)), ')']
                : [makeKeyword('DEFAULT VALUES')];
            const override = propStr(w, 'override');
            const overrideDoc: Doc = override ? [' ', makeKeyword(`OVERRIDING ${override} VALUE`)] : '';
            actionDoc = [makeKeyword('INSERT'), colList, overrideDoc, hardline, valList];
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
    const makeKeyword = (k: string) => keyword(k, opts);
    const head: Doc = [makeKeyword(`ALTER ${propStr(node, 'objType') ?? 'FUNCTION'}`), ' ', propStr(node, 'name') ?? ''];
    const rename = propStr(node, 'rename');
    if (rename) return [[head, ' ', makeKeyword('RENAME TO'), ' ', rename], ';'];

    const attributes = propStrArr(node, 'attributes');
    return [[head, indent([hardline, join(hardline, attributes.map(makeKeyword))])], ';'];
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
    const ifExists: Doc = propBool(node, 'ifExists') ? [makeKeyword('IF EXISTS'), ' '] : '';
    return [[makeKeyword(`ALTER ${objType}`), ' ', ifExists, name, ' ', makeKeyword('SET SCHEMA'), ' ', newSchema], ';'];
}

// ---------------------------------------------------------------------------
// REFRESH MATERIALIZED VIEW
// ---------------------------------------------------------------------------

function printRefreshMatView(node: SqlNode, opts: Options): Doc {
    const makeKeyword         = (k: string) => keyword(k, opts);
    const name       = prop(node, 'name');
    const concurrent = propBool(node, 'concurrent');
    const withNoData = propBool(node, 'withNoData');

    return [
        makeKeyword('REFRESH MATERIALIZED VIEW'),
        concurrent ? [' ', makeKeyword('CONCURRENTLY')] : '',
        ' ', rangeVarName(name),
        withNoData ? [' ', makeKeyword('WITH NO DATA')] : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// SELECT INTO
// ---------------------------------------------------------------------------

function printSelectInto(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const persistence = propStr(node, 'persistence');
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

    const intoKw: Doc = persistence ? [makeKeyword('INTO'), ' ', makeKeyword(persistence)] : makeKeyword('INTO');
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
    const restrictive = propBool(node, 'restrictive');  // absent = PERMISSIVE (the default)
    const using    = prop(node, 'using');
    const withCheck = prop(node, 'withCheck');

    const parts: Doc[] = [];
    parts.push([makeKeyword('CREATE POLICY'), ' ', policyName]);
    parts.push([makeKeyword('ON'), ' ', rangeVarName(table)]);
    if (restrictive) parts.push([makeKeyword('AS'), ' ', makeKeyword('RESTRICTIVE')]);

    if (cmdName) parts.push([makeKeyword('FOR'), ' ', makeKeyword(cmdName)]);
    // `TO public` is CREATE POLICY's default, so leave it implicit
    const roles = propStrArr(node, 'roles');
    if (roles.length > 0 && !(roles.length === 1 && roles[0] === 'public')) parts.push(policyRolesDoc(roles, opts));
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
    // Unlike CREATE POLICY, an explicit `TO public` here is a change and must stay
    const roles = propStrArr(node, 'roles');
    if (roles.length > 0) parts.push(policyRolesDoc(roles, opts));
    if (using) parts.push([makeKeyword('USING'), ' (', printNode(using), ')']);
    if (withCheck) parts.push([makeKeyword('WITH CHECK'), ' (', printNode(withCheck), ')']);

    return [join(hardline, parts), ';'];
}

// Role names arrive already quoted where needed; PUBLIC, CURRENT_USER etc.
// arrive as lowercase pseudo-role names and print as keywords.
const PSEUDO_ROLES = new Set(['public', 'current_user', 'current_role', 'session_user']);

function policyRolesDoc(roles: string[], opts: Options): Doc {
    return [keyword('TO', opts), ' ', roleListDoc(roles, opts)];
}

/** A comma-separated role list, with PUBLIC, CURRENT_USER etc. printed as keywords. */
function roleListDoc(roles: string[], opts: Options): Doc {
    return join(', ', roles.map((r): Doc => (PSEUDO_ROLES.has(r) ? keyword(r.toUpperCase(), opts) : r)));
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
    const asensitive = propBool(node, 'asensitive');
    const binary   = propBool(node, 'binary');
    const withHold = propBool(node, 'withHold');
    const query    = prop(node, 'query');

    const scrollKw: Doc = noScroll ? [' ', makeKeyword('NO SCROLL')] : scroll ? [' ', makeKeyword('SCROLL')] : '';
    const binaryKw: Doc = binary ? [makeKeyword('BINARY'), ' '] : '';
    const insensKw: Doc = insensitive
        ? [makeKeyword('INSENSITIVE'), ' ']
        : asensitive
          ? [makeKeyword('ASENSITIVE'), ' ']
          : '';
    const holdKw: Doc = withHold ? [' ', makeKeyword('WITH HOLD')] : '';

    return [
        [makeKeyword('DECLARE'), ' ', name, scrollKw, ' ', insensKw, binaryKw, makeKeyword('CURSOR'), holdKw, ' ', makeKeyword('FOR')],
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
    const printNode = printWith(opts);
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
        dest = [makeKeyword('PROGRAM'), ' ', sqlString(filename)];
    } else if (filename) {
        dest = sqlString(filename);
    } else {
        dest = isFrom ? makeKeyword('STDIN') : makeKeyword('STDOUT');
    }

    let optionPart: Doc = '';
    if (options.length > 0) {
        const optDocs = options.map((o) => utilityOptionDoc(o, opts));
        optionPart = [' (', join(', ', optDocs), ')'];
    }

    const whereNode = prop(node, 'where');
    const wherePart: Doc = whereNode
        ? [hardline, makeKeyword('WHERE'), ' ', printExpression(whereNode, opts, printNode)]
        : '';

    return [group([makeKeyword('COPY'), ' ', sourceDest, ' ', dirKw, ' ', dest, optionPart, wherePart]), ';'];
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

    const optDocs = options.map((o) => utilityOptionDoc(o, opts));

    return [[makeKeyword('EXPLAIN'), ' (', join(', ', optDocs), ') ', query ? printQueryExpr(query, opts) : ''], ';'];
}

/** A COPY / EXPLAIN option: `FORMAT csv`, `DELIMITER ','`, or a bare flag such as `ANALYZE`. */
type UtilityOption = { name: string; value?: string | null };

function utilityOptionDoc(option: UtilityOption, opts: Options): Doc {
    const name = keyword(option.name.toUpperCase(), opts);
    const value = option.value;
    if (value == null) return name;
    return [name, ' ', value === 'true' || value === 'false' ? keyword(value, opts) : value];
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
    const payloadPart: Doc = payload ? [', ', sqlString(payload)] : '';
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
        makeKeyword('LOCK TABLE'), ' ', join(', ', relations.map((r) => [onlyPrefix(r, opts), rangeVarName(r)])),
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
    const printNode = printWith(opts);
    const name   = prop(node, 'name');
    const parent = prop(node, 'parent');
    const bound  = prop(node, 'bound');
    const partitionBy = prop(node, 'partitionBy');
    const partitionDoc: Doc = partitionBy
        ? [hardline, makeKeyword('PARTITION BY'), ' ', makeKeyword(propStr(partitionBy, 'strategy') ?? 'RANGE'),
           ' (', join(', ', propArr(partitionBy, 'elements').map(printNode)), ')']
        : '';

    const boundText = bound ? printPartitionBound(bound, opts) : '';
    const boundDoc: Doc = boundText !== '' ? [hardline, boundText] : '';

    const columns = propArr(node, 'columns');
    return [
        createTableKeyword(node, opts), ' ', ifNotExistsDoc(node, opts), rangeVarName(name), hardline,
        indent([makeKeyword('PARTITION OF'), ' ', rangeVarName(parent)]),
        columns.length > 0
            ? [' (', indent([hardline, join([',', hardline], columns.map(printNode))]), hardline, ')']
            : '',
        boundDoc,
        partitionDoc,
        tableStorageClauses(node, opts),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: VACUUM / ANALYZE / CLUSTER / REINDEX
// ---------------------------------------------------------------------------

function printVacuum(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (k: string) => keyword(k, opts);
    const isVacuum  = propBool(node, 'isVacuum');
    const options   = (node.props?.['options'] as UtilityOption[] | undefined) ?? [];
    const relations = propArr(node, 'relations');
    const optionDocs = options.map((o) => utilityOptionDoc(o, opts));

    const relDoc: Doc = relations.length > 0
        ? [' ', join(', ', relations.map((r): Doc => {
            const columns = propStrArr(r, 'columns');
            return [rangeVarName(r), columns.length > 0 ? [' (', join(', ', columns), ')'] : ''];
        }))]
        : '';

    if (!isVacuum) {
        const optDoc: Doc = options.length > 0 ? [' (', join(', ', optionDocs), ')'] : '';
        return [[makeKeyword('ANALYZE'), optDoc, relDoc], ';'];
    }

    if (options.length === 0) {
        return [[makeKeyword('VACUUM'), relDoc], ';'];
    }
    const only = options.length === 1 ? options[0]! : undefined;
    if (only && !only.value && (only.name === 'verbose' || only.name === 'analyze')) {
        return [[makeKeyword('VACUUM'), ' ', makeKeyword(only.name.toUpperCase()), relDoc], ';'];
    }
    return [[makeKeyword('VACUUM'), ' (', join(', ', optionDocs), ')', relDoc], ';'];
}

function printCluster(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const relation = prop(node, 'relation');
    const indexName = propStr(node, 'indexName');

    const options = (node.props?.['options'] as UtilityOption[] | undefined) ?? [];

    return [
        [makeKeyword('CLUSTER'),
         options.length > 0 ? [' (', join(', ', options.map((o) => utilityOptionDoc(o, opts))), ')'] : '',
         relation ? [' ', rangeVarName(relation)] : '',
         indexName ? [' ', makeKeyword('USING'), ' ', indexName] : ''],
        ';',
    ];
}

function printReindex(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const kind     = propStr(node, 'kind') ?? 'TABLE';
    const relation = prop(node, 'relation');
    const name     = propStr(node, 'name');
    const options  = (node.props?.['options'] as UtilityOption[] | undefined) ?? [];

    const optDoc: Doc = options.length > 0
        ? [' (', join(', ', options.map((o) => utilityOptionDoc(o, opts))), ')']
        : '';

    return [
        [makeKeyword('REINDEX'), optDoc, ' ', makeKeyword(kind),
         relation ? [' ', rangeVarName(relation)] : '', name ? [' ', name] : ''],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Foreign Data Wrappers
// ---------------------------------------------------------------------------

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
    const ofType     = propStr(node, 'ofType');
    const partitionOf = prop(node, 'partitionOf');
    const bound      = prop(node, 'bound');
    const inherits   = propArr(node, 'inherits');
    const serverName = propStr(node, 'serverName') ?? '';

    return [
        makeKeyword('CREATE FOREIGN TABLE'), ' ', ifNotExistsDoc(node, opts), rangeVarName(name),
        ofType ? [' ', makeKeyword('OF'), ' ', ofType] : '',
        partitionOf ? [hardline, indent([makeKeyword('PARTITION OF'), ' ', rangeVarName(partitionOf)])] : '',
        columns.length > 0 || (!ofType && !partitionOf)
            ? [' (', indent([hardline, join([',', hardline], columns.map(printNode))]), hardline, ')']
            : '',
        bound ? [hardline, printPartitionBound(bound, opts)] : '',
        inherits.length > 0 ? [hardline, makeKeyword('INHERITS'), ' (', join(', ', inherits.map(rangeVarName)), ')'] : '',
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
    const listType      = propStr(node, 'listType');
    const tables        = propStrArr(node, 'tables');

    const listDoc: Doc = listType ? [' ', makeKeyword(listType), ' (', join(', ', tables), ')'] : '';

    return [
        [makeKeyword('IMPORT FOREIGN SCHEMA'), ' ', remoteSchema, listDoc, hardline,
         makeKeyword('FROM SERVER'), ' ', serverName, hardline,
         makeKeyword('INTO'), ' ', localSchema,
         printFdwOptions(node, opts)],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Logical Replication
// ---------------------------------------------------------------------------

/** One `table_and_columns` entry — table name plus optional column list and WHERE — no
 * leading TABLE keyword: printCreatePublication groups a run of these under one. */
function printPublicationTableItem(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const relation = prop(node, 'relation');
    const columns  = propStrArr(node, 'columns');
    const where    = prop(node, 'where');
    return [
        relation ? rangeVarName(relation) : '',
        columns.length > 0 ? [' (', join(', ', columns), ')'] : '',
        where ? [' ', makeKeyword('WHERE'), ' (', printNode(where), ')'] : '',
    ];
}

function printPublicationObject(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const kind   = propStr(node, 'kind') ?? 'TABLE';
    const schema = propStr(node, 'schema');

    if (kind === 'TABLES IN SCHEMA') return [makeKeyword('TABLES IN SCHEMA'), ' ', schema ?? ''];
    // CURRENT_SCHEMA here is the literal keyword-like token the grammar requires, not a
    // schema name to quote/case as an identifier.
    return [makeKeyword('TABLES IN SCHEMA'), ' ', makeKeyword('CURRENT_SCHEMA')];
}

/**
 * A `pubObjects` list as `TABLE a, b (c) WHERE (...), TABLES IN SCHEMA s, ...` — a run of
 * consecutive TABLE objects shares one TABLE keyword, since PostgreSQL's grammar allows
 * `FOR TABLE a, b (c) WHERE (...)`. Shared by CREATE PUBLICATION's FOR clause and ALTER
 * PUBLICATION's ADD/SET/DROP.
 */
function printPublicationObjectList(pubObjects: SqlNode[], opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode = printWith(opts);
    const segments: Doc[] = [];
    let run: SqlNode[] = [];
    const flushRun = () => {
        if (run.length === 0) return;
        segments.push([makeKeyword('TABLE'), ' ', join(', ', run.map((o) => printPublicationTableItem(o, opts, printNode)))]);
        run = [];
    };
    for (const o of pubObjects) {
        if ((propStr(o, 'kind') ?? 'TABLE') === 'TABLE') {
            run.push(o);
        } else {
            flushRun();
            segments.push(printPublicationObject(o, opts));
        }
    }
    flushRun();
    return join(', ', segments);
}

function printCreatePublication(node: SqlNode, opts: Options): Doc {
    const makeKeyword     = (k: string) => keyword(k, opts);
    const name       = propStr(node, 'name') ?? '';
    const pubObjects = propArr(node, 'pubObjects');
    const forAll     = propBool(node, 'forAllTables');
    const options    = propStrArr(node, 'options');

    let forPart: Doc;
    if (forAll) {
        forPart = [' ', makeKeyword('FOR ALL TABLES')];
    } else if (pubObjects.length > 0) {
        forPart = [hardline, indent([makeKeyword('FOR'), ' ', printPublicationObjectList(pubObjects, opts)])];
    } else {
        forPart = '';
    }
    const withPart: Doc = options.length > 0 ? [hardline, makeKeyword('WITH'), ' (', join(', ', options), ')'] : '';

    return [[makeKeyword('CREATE PUBLICATION'), ' ', name, forPart, withPart], ';'];
}

function printAlterPublication(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const name       = propStr(node, 'name') ?? '';
    const action     = propStr(node, 'action');
    const pubObjects = propArr(node, 'pubObjects');
    const options    = propStrArr(node, 'options');
    const head: Doc = [makeKeyword('ALTER PUBLICATION'), ' ', name];

    if (action && pubObjects.length > 0) {
        return [[head, ' ', makeKeyword(action), ' ', printPublicationObjectList(pubObjects, opts)], ';'];
    }
    // Reloption-only form: ALTER PUBLICATION name SET (publish = 'insert', ...)
    return [[head, ' ', makeKeyword('SET'), ' (', join(', ', options), ')'], ';'];
}

function printCreateSubscription(node: SqlNode, opts: Options): Doc {
    const makeKeyword           = (k: string) => keyword(k, opts);
    const name         = propStr(node, 'name') ?? '';
    const conninfo     = propStr(node, 'conninfo') ?? '';
    const publications = (node.props?.['publications'] as string[] | undefined) ?? [];
    const options       = propStrArr(node, 'options');
    const withPart: Doc = options.length > 0 ? [hardline, indent([makeKeyword('WITH'), ' (', join(', ', options), ')'])] : '';

    return [
        [makeKeyword('CREATE SUBSCRIPTION'), ' ', name, hardline,
         indent([makeKeyword('CONNECTION'), ' ', sqlString(conninfo)]), hardline,
         indent([makeKeyword('PUBLICATION'), ' ', join(', ', publications)]),
         withPart],
        ';',
    ];
}

function printAlterSubscription(node: SqlNode, opts: Options): Doc {
    const makeKeyword   = (k: string) => keyword(k, opts);
    const name          = propStr(node, 'name') ?? '';
    const kind          = propStr(node, 'kind') ?? '';
    const conninfo      = propStr(node, 'conninfo');
    const publications  = (node.props?.['publications'] as string[] | undefined) ?? [];
    const enabled       = propBool(node, 'enabled');
    const options       = propStrArr(node, 'options');
    const head: Doc      = [makeKeyword('ALTER SUBSCRIPTION'), ' ', name];
    const withPart: Doc  = options.length > 0 ? [' ', makeKeyword('WITH'), ' (', join(', ', options), ')'] : '';

    switch (kind) {
        case 'CONNECTION':
            return [[head, ' ', makeKeyword('CONNECTION'), ' ', sqlString(conninfo ?? '')], ';'];
        case 'SET PUBLICATION':
            return [[head, ' ', makeKeyword('SET PUBLICATION'), ' ', join(', ', publications), withPart], ';'];
        case 'ADD PUBLICATION':
            return [[head, ' ', makeKeyword('ADD PUBLICATION'), ' ', join(', ', publications), withPart], ';'];
        case 'DROP PUBLICATION':
            return [[head, ' ', makeKeyword('DROP PUBLICATION'), ' ', join(', ', publications), withPart], ';'];
        case 'REFRESH PUBLICATION':
            return [[head, ' ', makeKeyword('REFRESH PUBLICATION'), withPart], ';'];
        case 'ENABLED':
            return [[head, ' ', makeKeyword(enabled ? 'ENABLE' : 'DISABLE')], ';'];
        case 'SKIP':
            return [[head, ' ', makeKeyword('SKIP'), ' (', join(', ', options), ')'], ';'];
        case 'OPTIONS':
        default:
            return [[head, ' ', makeKeyword('SET'), ' (', join(', ', options), ')'], ';'];
    }
}

function printDropSubscription(node: SqlNode, opts: Options): Doc {
    const makeKeyword       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    const cascade  = propBool(node, 'cascade');

    return [
        [
            makeKeyword('DROP SUBSCRIPTION'),
            ifExists ? [' ', makeKeyword('IF EXISTS')] : '',
            ' ',
            name,
            cascade ? [' ', makeKeyword('CASCADE')] : '',
        ],
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
    const printNode = printWith(opts);
    const args     = propArr(node, 'args');
    const ordered  = propArr(node, 'orderedArgs');
    const options  = propArr(node, 'options');
    const argList = (list: SqlNode[]): Doc => join(', ', list.map(printNode));
    const argsDoc: Doc = propBool(node, 'star')
        ? ' (*)'
        : node.props?.['args'] === undefined && ordered.length === 0
            ? ''
            : [' (', args.length > 0 ? argList(args) : '', ordered.length > 0 ? [args.length > 0 ? ' ' : '', makeKeyword('ORDER BY'), ' ', argList(ordered)] : '', ')'];

    return [
        makeKeyword(propBool(node, 'orReplace') ? 'CREATE OR REPLACE AGGREGATE' : 'CREATE AGGREGATE'), ' ', name, argsDoc, ' (',
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
        return [[makeKeyword('CREATE COLLATION'), ' ', name, ' ', makeKeyword('FROM'), ' ', fromName], ';'];
    }

    return [
        makeKeyword('CREATE COLLATION'), ' ', name, ' (',
        join(', ', options.map((o) => {
            const val = propStr(o, 'val');
            return val ? `${propStr(o, 'key') ?? ''} = ${val}` : (propStr(o, 'key') ?? '');
        })),
        ');',
    ];
}

// ---------------------------------------------------------------------------
// P4: Security Labels
// ---------------------------------------------------------------------------

function printSecurityLabel(node: SqlNode, opts: Options): Doc {
    const makeKeyword      = (k: string) => keyword(k, opts);
    const provider = propStr(node, 'provider');
    const objType  = propStr(node, 'objType') ?? 'table';
    const objName  = propStr(node, 'objName') ?? '';
    const label    = propStr(node, 'label') ?? '';

    return [
        // FOR provider is optional: with a single label provider loaded, PostgreSQL uses it
        [makeKeyword('SECURITY LABEL'), provider ? [' ', makeKeyword('FOR'), ' ', provider] : '', ' ', makeKeyword('ON'), ' ', makeKeyword(objType), ' ', objName, ' ', makeKeyword('IS'), ' ', sqlString(label)],
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
    return [[keyword('LOAD', opts), ' ', sqlString(filename)], ';'];
}

function printAlterSystem(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const kind   = propStr(node, 'kind') ?? 'SET';
    const name   = propStr(node, 'name') ?? '';
    const values = propStrArr(node, 'values');

    if (kind === 'RESET ALL') return [[makeKeyword('ALTER SYSTEM RESET ALL')], ';'];
    if (kind === 'RESET')     return [[makeKeyword('ALTER SYSTEM RESET'), ' ', name], ';'];

    // Values arrive as SQL text (numbers, bare words, or quoted literals)
    return [[makeKeyword('ALTER SYSTEM SET'), ' ', name, ' = ', join(', ', values)], ';'];
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
    parts.push(hardline, indent([makeKeyword('LOCATION'), ' ', sqlString(location)]));
    return [parts, ';'];
}

function printDropTableSpace(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [[makeKeyword('DROP TABLESPACE'), ifExists ? [' ', makeKeyword('IF EXISTS')] : '', ' ', name], ';'];
}
