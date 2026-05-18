import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
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
} from './utils.js';
import { prop, propArr, propStr, propBool, rangeVarName } from './helpers.js';
import { printExpression, printWindowDef } from './expressions.js';

type PrintFn = (node: SqlNode) => Doc;

// ---------------------------------------------------------------------------
// Script root
// ---------------------------------------------------------------------------

export function printScript(node: SqlNode, opts: Options): Doc {
    const statements = propArr(node, 'statements');
    if (statements.length === 0) return '';
    const docs = statements.map((s) => printStatementWithComments(s, opts));
    return [...join([hardline, hardline], docs), hardline];
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

function pn(opts: Options): PrintFn {
    return function printNode(n: SqlNode): Doc {
        return n.type.endsWith('Statement')
            ? printQueryExpr(n, opts)
            : printExpression(n, opts, printNode);
    };
}

/**
 * Density-aware boolean clause (WHERE / HAVING / ON CONFLICT WHERE).
 * Single predicate: inline in compact/standard; indented in spacious.
 * Multi-predicate (BoolExpr AND/OR): always indented.
 */
function printBoolClause(kw: string, where: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (k: string) => keyword(k, opts);
    const density = getDensity(opts);
    const isMulti = where.type === 'BoolExpr';
    const inline = density !== 'spacious' && !isMulti;
    const body = printNode(where);
    return [mk(kw), inline ? [' ', body] : indent([hardline, body])];
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

function printCtes(ctes: SqlNode, opts: Options, printNode: PrintFn): Doc[] {
    const mk = (k: string) => keyword(k, opts);
    const cteList   = propArr(ctes, 'ctes');
    const recursive = propBool(ctes, 'recursive');
    const cteKw     = recursive ? mk('WITH RECURSIVE') : mk('WITH');
    const cteDocs = cteList.map((cte) => {
        const name  = propStr(cte, 'name') ?? '';
        const query = prop(cte, 'query');
        const search = prop(cte, 'search');
        const cycle  = prop(cte, 'cycle');
        const parts: Doc[] = [name, ' ', mk('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
        if (search) {
            const breadthFirst = propBool(search, 'breadthFirst');
            const cols = (search.props?.['columns'] as string[] | undefined) ?? [];
            const seqCol = propStr(search, 'seqColumn') ?? '';
            const firstLast = breadthFirst ? mk('BREADTH FIRST') : mk('DEPTH FIRST');
            parts.push(hardline, mk('SEARCH'), ' ', firstLast, ' ', mk('BY'), ' ', join(', ', cols), ' ', mk('SET'), ' ', seqCol);
        }
        if (cycle) {
            const cols = (cycle.props?.['columns'] as string[] | undefined) ?? [];
            const markCol = propStr(cycle, 'markColumn') ?? '';
            const pathCol = propStr(cycle, 'pathColumn') ?? '';
            parts.push(hardline, mk('CYCLE'), ' ', join(', ', cols), ' ', mk('SET'), ' ', markCol, ' ', mk('USING'), ' ', pathCol);
        }
        return parts;
    });
    return [[cteKw, indent([hardline, join([',', hardline], cteDocs)])]];
}

function printSelectBody(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);

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
        ? [mk('SELECT'), ' ', mk('DISTINCT ON'), ' (', join(', ', distinctOn.map(printNode)), ')']
        : distinct
          ? [mk('SELECT'), ' ', mk('DISTINCT')]
          : mk('SELECT');
    parts.push([selectKw, indent([hardline, join(hardSep(opts), targets.map(printNode))])]);

    if (from.length > 0) {
        // Always indent from items so JOINs align properly under FROM
        parts.push([mk('FROM'), indent([hardline, join([',', hardline], from.map(printNode))])]);
    }

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (groupBy.length > 0) {
        parts.push([mk('GROUP BY'), indent([hardline, join(hardSep(opts), groupBy.map(printNode))])]);
    }

    if (having) parts.push(printBoolClause('HAVING', having, opts, printNode));

    if (orderBy.length > 0) {
        parts.push([mk('ORDER BY'), indent([hardline, join(hardSep(opts), orderBy.map(printNode))])]);
    }

    if (limit)  parts.push([mk('LIMIT'), ' ', printNode(limit)]);
    if (offset) parts.push([mk('OFFSET'), ' ', printNode(offset)]);

    const locking = propArr(node, 'locking');
    for (const lc of locking) {
        const strength   = propStr(lc, 'strength') ?? 'FOR UPDATE';
        const tables     = propArr(lc, 'tables');
        const waitPolicy = propStr(lc, 'waitPolicy');
        const ofPart: Doc = tables.length > 0
            ? [' ', mk('OF'), ' ', join(', ', tables.map((t) => rangeVarName(t)))]
            : '';
        const waitPart: Doc = waitPolicy ? [' ', mk(waitPolicy)] : '';
        parts.push([mk(strength), ofPart, waitPart]);
    }

    // Named WINDOW clauses: WINDOW w AS (PARTITION BY ... ORDER BY ...)
    const windowClauses = propArr(node, 'windowClauses');
    if (windowClauses.length > 0) {
        const wDocs = windowClauses.map((w) => {
            const wName = propStr(w, 'name') ?? '';
            const wSpec = printWindowDef(w, opts, printNode);
            return [wName, ' ', mk('AS'), ' (', wSpec, ')'];
        });
        parts.push([mk('WINDOW'), indent([hardline, join(hardSep(opts), wDocs)])]);
    }

    return group(join(hardline, parts));
}

function printSelect(node: SqlNode, opts: Options): Doc {
    return [printSelectBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

function printInsertBody(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);

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

    const overridePart: Doc = override ? [' ', mk(`OVERRIDING ${override} VALUE`)] : '';

    const sourcePart: Doc = source?.type === 'DefaultValues'
        ? [hardline, mk('DEFAULT VALUES')]
        : source?.type === 'ValuesStatement'
          ? printValuesRows(source, opts, printNode)
          : source
            ? [hardline, printQueryExpr(source, opts)]
            : '';

    const parts: Doc[] = [
        ...cteParts,
        [mk('INSERT INTO'), ' ', rangeVarName(target), colsPart, overridePart, sourcePart],
    ];

    if (onConflict) parts.push(printOnConflict(onConflict, opts, printNode));

    if (returning.length > 0) {
        parts.push([mk('RETURNING'), indent([hardline, join(hardSep(opts), returning.map(printNode))])]);
    }

    return group(join(hardline, parts));
}

function printInsert(node: SqlNode, opts: Options): Doc {
    return [printInsertBody(node, opts), ';'];
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function printUpdateBody(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);

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

    const parts: Doc[] = [
        [mk('UPDATE'), ' ', rangeVarName(target)],
        [
            mk('SET'),
            density !== 'spacious' && setDocs.length === 1
                ? [' ', setDocs[0]!]
                : indent([hardline, join(hardSep(opts), setDocs)]),
        ],
    ];

    if (from.length > 0) {
        parts.push([mk('FROM'), indent([hardline, join([',', hardline], from.map(printNode))])]);
    }

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (returning.length > 0) {
        parts.push([mk('RETURNING'), indent([hardline, join(hardSep(opts), returning.map(printNode))])]);
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
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);

    const target    = prop(node, 'target');
    const using     = propArr(node, 'using');
    const where     = prop(node, 'where');
    const returning = propArr(node, 'returning');

    const parts: Doc[] = [
        [mk('DELETE FROM'), ' ', rangeVarName(target)],
    ];

    if (using.length > 0) {
        parts.push([mk('USING'), indent([hardline, join([',', hardline], using.map(printNode))])]);
    }

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    if (returning.length > 0) {
        parts.push([mk('RETURNING'), indent([hardline, join(hardSep(opts), returning.map(printNode))])]);
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
    const mk    = (k: string) => keyword(k, opts);
    const op    = propStr(node, 'op') ?? 'UNION';
    const all   = propBool(node, 'all');
    const lhs   = prop(node, 'lhs');
    const rhs   = prop(node, 'rhs');
    const opKw  = all ? mk(`${op} ALL`) : mk(op);

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
    const mk      = (k: string) => keyword(k, opts);
    const rows    = propArr(node, 'rows');
    const rowDocs = rows.map((row) => {
        const items = propArr(row, 'items').map(printNode);
        return group(['(', indent([softline, join(softSep(opts), items)]), softline, ')']);
    });

    if (rowDocs.length === 1) {
        return [hardline, mk('VALUES'), ' ', rowDocs[0]!];
    }
    return [hardline, mk('VALUES'), indent([hardline, join(hardSep(opts), rowDocs)])];
}

function printValues(node: SqlNode, opts: Options): Doc {
    return [printValuesRows(node, opts, pn(opts)), ';'];
}

// ---------------------------------------------------------------------------
// ON CONFLICT
// ---------------------------------------------------------------------------

function printOnConflict(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const action     = propStr(node, 'action') ?? 'NOTHING';
    const target     = prop(node, 'target');
    const sets       = propArr(node, 'sets');
    const where      = prop(node, 'where');

    let targetDoc: Doc = '';
    if (target) {
        const cols       = propArr(target, 'columns');
        const constraint = propStr(target, 'constraint');
        if (constraint) {
            targetDoc = [' ', mk('ON CONSTRAINT'), ' ', constraint];
        } else if (cols.length > 0) {
            targetDoc = group([' (', indent([softline, join(softSep(opts), cols.map((c) => propStr(c, 'name') ?? ''))]), softline, ')']);
        }
    }

    if (action === 'NOTHING') {
        return [mk('ON CONFLICT'), targetDoc, ' ', mk('DO NOTHING')];
    }

    // DO UPDATE SET
    const setDocs = sets.map((s) => {
        const name = propStr(s, 'name') ?? '';
        const val  = prop(s, 'val');
        return [name, ' = ', val ? printNode(val) : ''] as Doc;
    });

    const density = getDensity(opts);
    const parts: Doc[] = [
        [mk('ON CONFLICT'), targetDoc, ' ', mk('DO UPDATE')],
        [
            mk('SET'),
            density !== 'spacious' && setDocs.length === 1
                ? [' ', setDocs[0]!]
                : indent([hardline, join(hardSep(opts), setDocs)]),
        ],
    ];

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    return join(hardline, parts);
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

function printCreateTable(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const name     = prop(node, 'name');
    const columns  = propArr(node, 'columns');
    const partitionBy = prop(node, 'partitionBy');

    const partitionDoc: Doc = partitionBy
        ? [hardline, mk('PARTITION BY'), ' ', mk(propStr(partitionBy, 'strategy') ?? 'RANGE'),
           ' (', join(', ', (partitionBy.props?.['columns'] as string[] | undefined) ?? []), ')']
        : '';

    return [
        mk('CREATE TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ')',
        partitionDoc,
        ';',
    ];
}

function printAlterTable(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const name     = prop(node, 'name');
    const commands = propArr(node, 'commands');

    return [
        mk('ALTER TABLE'), ' ', rangeVarName(name),
        indent([hardline, join([',', hardline], commands.map(printNode))]),
        ';',
    ];
}

function printCreateView(node: SqlNode, opts: Options): Doc {
    const mk    = (k: string) => keyword(k, opts);
    const name  = prop(node, 'name');
    const body  = prop(node, 'body');

    return [
        mk('CREATE VIEW'), ' ', rangeVarName(name), hardline,
        mk('AS'), hardline,
        body ? printQueryExpr(body, opts) : '',
        ';',
    ];
}

function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const printNode  = pn(opts);
    const name       = propStr(node, 'name') ?? '';
    const parameters = propArr(node, 'parameters');
    const returnType = propStr(node, 'returnType');
    const language   = propStr(node, 'language');
    const body       = propStr(node, 'body');

    const parts: Doc[] = [
        mk('CREATE FUNCTION'), ' ', name,
        '(', join(', ', parameters.map(printNode)), ')',
    ];

    if (returnType) parts.push(hardline, mk('RETURNS'), ' ', mk(returnType));
    if (language)   parts.push(hardline, mk('LANGUAGE'), ' ', language);
    if (body != null) {
        parts.push(hardline, mk('AS'), ' ', '$$', body, '$$');
    }

    return [join('', parts), ';'];
}

function printCreateIndex(node: SqlNode, opts: Options): Doc {
    const mk        = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const unique    = propBool(node, 'unique');
    const indexName = propStr(node, 'indexName') ?? '';
    const relation  = prop(node, 'relation');
    const columns   = propArr(node, 'columns');

    return [
        unique ? [mk('CREATE UNIQUE INDEX'), ' '] : [mk('CREATE INDEX'), ' '],
        indexName, ' ', mk('ON'), ' ', rangeVarName(relation),
        ' (', join(', ', columns.map(printNode)), ');',
    ];
}

function printTruncate(node: SqlNode, opts: Options): Doc {
    const mk        = (k: string) => keyword(k, opts);
    const relations = propArr(node, 'relations');
    const restart   = propBool(node, 'restartSeqs');
    const cascade   = propBool(node, 'cascade');

    return [
        mk('TRUNCATE TABLE'), ' ', join(', ', relations.map(rangeVarName)),
        restart  ? [' ', mk('RESTART IDENTITY')]  : '',
        cascade  ? [' ', mk('CASCADE')]            : '',
        ';',
    ];
}

function printDrop(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const objectType = propStr(node, 'objectType') ?? '';
    const ifExists   = propBool(node, 'ifExists');
    const cascade    = propBool(node, 'cascade');

    return [
        mk('DROP'), ' ', objectType,
        ifExists ? [' ', mk('IF EXISTS')] : '',
        cascade  ? [' ', mk('CASCADE')]   : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// SET / SHOW / RESET
// ---------------------------------------------------------------------------

function printVariableSet(node: SqlNode, opts: Options): Doc {
    const mk     = (k: string) => keyword(k, opts);
    const kind   = propStr(node, 'kind') ?? 'SET';
    const name   = propStr(node, 'name') ?? '';
    const values = (node.props?.['values'] as string[] | undefined) ?? [];
    const local  = propBool(node, 'local');

    if (kind === 'RESET ALL') return [mk('RESET ALL'), ';'];
    if (kind === 'RESET')     return [[mk('RESET'), ' ', name], ';'];

    const localKw: Doc = local ? [mk('LOCAL'), ' '] : '';

    if (kind === 'SET DEFAULT') {
        return [[mk('SET'), ' ', localKw, name, ' ', mk('TO'), ' ', mk('DEFAULT')], ';'];
    }

    // SET name = value(s)
    const valDocs: Doc[] = values.map((v) => {
        // bare identifiers vs quoted strings — emit unquoted (they were stored as identifier strings)
        return v;
    });
    return [[mk('SET'), ' ', localKw, name, ' = ', join(', ', valDocs)], ';'];
}

function printVariableShow(node: SqlNode, opts: Options): Doc {
    const mk   = (k: string) => keyword(k, opts);
    const name = propStr(node, 'name') ?? '';
    return [[mk('SHOW'), ' ', name], ';'];
}

// ---------------------------------------------------------------------------
// GRANT / REVOKE
// ---------------------------------------------------------------------------

function printGrantRevoke(node: SqlNode, opts: Options, isGrant: boolean): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const privs   = (node.props?.['privs'] as string[] | undefined) ?? [];
    const objtype = propStr(node, 'objtype') ?? '';
    const objects = propArr(node, 'objects');
    const grantees = (node.props?.['grantees'] as string[] | undefined) ?? [];
    const grantOption = propBool(node, 'grantOption');
    const cascade    = propBool(node, 'cascade');

    const privsDoc: Doc = privs.length > 0 ? join(', ', privs.map(mk)) : mk('ALL PRIVILEGES');
    const verb: Doc = isGrant ? mk('GRANT') : mk('REVOKE');
    const toFrom: Doc = isGrant ? mk('TO') : mk('FROM');

    const objectsDoc: Doc = objects.length > 0
        ? join(', ', objects.map(printNode))
        : '';

    const parts: Doc[] = [
        [verb, ' ', privsDoc, ' ', mk('ON'), ' ', mk(objtype), objectsDoc ? [' ', objectsDoc] : ''],
        [toFrom, ' ', join(', ', grantees)],
    ];

    if (isGrant && grantOption) parts.push(mk('WITH GRANT OPTION'));
    if (!isGrant && cascade)    parts.push(mk('CASCADE'));

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
    const mk      = (k: string) => keyword(k, opts);
    const stmtType = propStr(node, 'stmtType') ?? 'ROLE';
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [[mk(`CREATE ${stmtType}`), ' ', name]];
    if (options.length > 0) parts.push(join(' ', options.map(mk)));
    return [join(hardline, parts), ';'];
}

function printAlterRole(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [[mk('ALTER ROLE'), ' ', name]];
    if (options.length > 0) parts.push(join(' ', options.map(mk)));
    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// RENAME (ALTER TABLE ... RENAME / ALTER INDEX ... RENAME / etc.)
// ---------------------------------------------------------------------------

function printRename(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const renameType = propStr(node, 'renameType') ?? 'RENAME TABLE';
    const relation   = prop(node, 'relation');
    const oldName    = propStr(node, 'oldName');
    const newName    = propStr(node, 'newName') ?? '';

    if (renameType === 'RENAME TABLE') {
        return [[mk('ALTER TABLE'), ' ', rangeVarName(relation), ' ', mk('RENAME TO'), ' ', newName], ';'];
    }
    if (renameType === 'RENAME COLUMN') {
        return [[mk('ALTER TABLE'), ' ', rangeVarName(relation), ' ', mk('RENAME COLUMN'), ' ', oldName ?? '', ' ', mk('TO'), ' ', newName], ';'];
    }
    // INDEX, SCHEMA, VIEW, SEQUENCE, TYPE ...
    const objKw = renameType.replace('RENAME ', '');
    return [[mk(`ALTER ${objKw}`), ' ', rangeVarName(relation) ?? oldName ?? '', ' ', mk('RENAME TO'), ' ', newName], ';'];
}

// ---------------------------------------------------------------------------
// CREATE TYPE / ALTER TYPE
// ---------------------------------------------------------------------------

function printCreateType(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const kind     = propStr(node, 'kind') ?? 'COMPOSITE';
    const typeName = propStr(node, 'typeName') ?? '';
    const columns  = propArr(node, 'columns');
    const values   = (node.props?.['values'] as string[] | undefined) ?? [];

    if (kind === 'ENUM') {
        const valList: Doc = values.length > 0
            ? ['(', indent([hardline, join([',', hardline], values.map((v) => `'${v}'`))]), hardline, ')']
            : '()';
        return [[mk('CREATE TYPE'), ' ', typeName, ' ', mk('AS ENUM'), ' ', valList], ';'];
    }

    // COMPOSITE
    return [
        mk('CREATE TYPE'), ' ', typeName, ' ', mk('AS'), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ');',
    ];
}

function printAlterType(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const typeName    = propStr(node, 'typeName') ?? '';
    const newVal      = propStr(node, 'newVal') ?? '';
    const neighbor    = propStr(node, 'neighbor');
    const isAfter     = propBool(node, 'isAfter');
    const ifNotExists = propBool(node, 'ifNotExists');

    const ifNE: Doc = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    const placement: Doc = neighbor
        ? [' ', isAfter ? mk('AFTER') : mk('BEFORE'), ' ', `'${neighbor}'`]
        : '';

    return [[mk('ALTER TYPE'), ' ', typeName, ' ', mk('ADD VALUE'), ' ', ifNE, `'${newVal}'`, placement], ';'];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER SEQUENCE
// ---------------------------------------------------------------------------

function printCreateSequence(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const schema      = propStr(node, 'schema');
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const options     = (node.props?.['options'] as string[] | undefined) ?? [];

    const qname = schema ? `${schema}.${name}` : name;
    const ifNE: Doc = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    const parts: Doc[] = [[mk('CREATE SEQUENCE'), ' ', ifNE, qname]];
    for (const opt of options) parts.push(mk(opt));
    return [join(hardline, parts), ';'];
}

function printAlterSequence(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const schema  = propStr(node, 'schema');
    const name    = propStr(node, 'name') ?? '';
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const qname = schema ? `${schema}.${name}` : name;
    const parts: Doc[] = [[mk('ALTER SEQUENCE'), ' ', qname]];
    for (const opt of options) parts.push(mk(opt));
    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// CREATE SCHEMA
// ---------------------------------------------------------------------------

function printCreateSchema(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const name        = propStr(node, 'name') ?? '';
    const authRole    = propStr(node, 'authRole');
    const ifNotExists = propBool(node, 'ifNotExists');

    const ifNE: Doc   = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    const authDoc: Doc = authRole ? [' ', mk('AUTHORIZATION'), ' ', authRole] : '';
    return [[mk('CREATE SCHEMA'), ' ', ifNE, name, authDoc], ';'];
}

// ---------------------------------------------------------------------------
// CREATE EXTENSION
// ---------------------------------------------------------------------------

function printCreateExtension(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const schema      = propStr(node, 'schema');
    const version     = propStr(node, 'version');

    const ifNE: Doc     = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    const schemaDoc: Doc = schema  ? [hardline, mk('SCHEMA'), ' ', schema]  : '';
    const versionDoc: Doc = version ? [hardline, mk('VERSION'), ' ', `'${version}'`] : '';
    return [[mk('CREATE EXTENSION'), ' ', ifNE, `"${name}"`, schemaDoc, versionDoc], ';'];
}

// ---------------------------------------------------------------------------
// CREATE TABLE AS / CREATE MATERIALIZED VIEW
// ---------------------------------------------------------------------------

function printCreateTableAs(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const schema      = propStr(node, 'schema');
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const query       = prop(node, 'query');

    const qname = schema ? `${schema}.${name}` : name;
    const ifNE: Doc = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    return [
        mk('CREATE TABLE'), ' ', ifNE, qname, ' ', mk('AS'),
        hardline, query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

function printCreateMatView(node: SqlNode, opts: Options): Doc {
    const mk          = (k: string) => keyword(k, opts);
    const schema      = propStr(node, 'schema');
    const name        = propStr(node, 'name') ?? '';
    const ifNotExists = propBool(node, 'ifNotExists');
    const query       = prop(node, 'query');

    const qname = schema ? `${schema}.${name}` : name;
    const ifNE: Doc = ifNotExists ? [mk('IF NOT EXISTS'), ' '] : '';
    return [
        mk('CREATE MATERIALIZED VIEW'), ' ', ifNE, qname, ' ', mk('AS'),
        hardline, query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// CREATE TRIGGER
// ---------------------------------------------------------------------------

function printCreateTrigger(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const name     = propStr(node, 'name') ?? '';
    const timing   = propStr(node, 'timing') ?? 'AFTER';
    const events   = (node.props?.['events'] as string[] | undefined) ?? [];
    const relation = prop(node, 'relation');
    const forEach  = propStr(node, 'forEach') ?? 'ROW';
    const funcName = propStr(node, 'funcName') ?? '';
    const when     = prop(node, 'when');

    const eventDoc: Doc = join([' ', mk('OR'), ' '], events.map(mk));
    const whenDoc: Doc  = when ? [hardline, mk('WHEN'), ' (', printNode(when), ')'] : '';

    return [
        mk('CREATE TRIGGER'), ' ', name,
        hardline, mk(timing), ' ', eventDoc, ' ', mk('ON'), ' ', rangeVarName(relation),
        hardline, mk(`FOR EACH ${forEach}`),
        whenDoc,
        hardline, mk('EXECUTE FUNCTION'), ' ', funcName, '()',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// COMMENT ON
// ---------------------------------------------------------------------------

function printComment(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const objtype = propStr(node, 'objtype') ?? '';
    const object  = propStr(node, 'object') ?? '';
    const comment = propStr(node, 'comment');

    const commentVal: Doc = comment != null ? `'${comment.replace(/'/g, "''")}'` : mk('NULL');
    return [[mk('COMMENT ON'), ' ', mk(objtype), ' ', object, ' ', mk('IS'), ' ', commentVal], ';'];
}

// ---------------------------------------------------------------------------
// Transaction control
// ---------------------------------------------------------------------------

function printTransaction(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const kind = propStr(node, 'kind') ?? 'COMMIT';
    const savepoint = propStr(node, 'savepoint');
    const gid = propStr(node, 'gid');
    const options = (node.props?.['options'] as string[] | undefined) ?? [];

    const parts: Doc[] = [mk(kind)];

    // SAVEPOINT, RELEASE SAVEPOINT, ROLLBACK TO SAVEPOINT all take a savepoint name
    if (kind === 'RELEASE') parts.push(' ', mk('SAVEPOINT'));
    if (kind === 'ROLLBACK TO') parts.push(' ', mk('SAVEPOINT'));
    if (savepoint) parts.push(' ', savepoint);
    if (gid) parts.push(' ', `'${gid}'`);
    if (options.length > 0) parts.push(' ', join(', ', options.map((o) => mk(o))));

    return [parts, ';'];
}

// ---------------------------------------------------------------------------
// CALL
// ---------------------------------------------------------------------------

function printCall(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const call = prop(node, 'call');
    return [[mk('CALL'), ' ', call ? printNode(call) : ''], ';'];
}

// ---------------------------------------------------------------------------
// DO
// ---------------------------------------------------------------------------

function printDo(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const language = propStr(node, 'language') ?? 'plpgsql';
    const body = propStr(node, 'body') ?? '';
    // Standard convention: body first, LANGUAGE after
    return [[mk('DO'), ' ', '$$', body, '$$', hardline, mk('LANGUAGE'), ' ', language], ';'];
}

// ---------------------------------------------------------------------------
// MERGE
// ---------------------------------------------------------------------------

function printMerge(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const printNode = pn(opts);

    const target    = prop(node, 'target');
    const source    = prop(node, 'source');
    const on        = prop(node, 'on');
    const whens     = propArr(node, 'whens');
    const returning = propArr(node, 'returning');
    const ctes      = prop(node, 'ctes');

    const parts: Doc[] = [];

    if (ctes) parts.push(...printCtes(ctes, opts, printNode));

    parts.push([mk('MERGE INTO'), ' ', target ? printNode(target) : '']);
    parts.push([mk('USING'), ' ', source ? printNode(source) : '']);
    parts.push([mk('ON'), ' ', on ? printNode(on) : '']);

    for (const w of whens) {
        const matchKind = propStr(w, 'matchKind') ?? 'MATCHED';
        const cmd       = propStr(w, 'cmd') ?? 'DO NOTHING';
        const condition = prop(w, 'condition');
        const targets   = propArr(w, 'targets');
        const values    = propArr(w, 'values');

        let whenLine: Doc = [mk('WHEN'), ' ', mk(matchKind)];
        if (condition) whenLine = [whenLine, ' ', mk('AND'), ' ', printNode(condition)];
        whenLine = [whenLine, ' ', mk('THEN')];

        let actionDoc: Doc;
        if (cmd === 'DO NOTHING') {
            actionDoc = mk('DO NOTHING');
        } else if (cmd === 'DELETE') {
            actionDoc = mk('DELETE');
        } else if (cmd === 'UPDATE') {
            // ResTarget: name=column, val=value → "col = val"
            const assignments: Doc[] = targets.map((t) => {
                const col = propStr(t, 'name') ?? '';
                const val = prop(t, 'val');
                return [col, ' = ', val ? printNode(val) : ''] as Doc;
            });
            actionDoc = [mk('UPDATE SET'), indent([hardline, join(hardSep(opts), assignments)])];
        } else { // INSERT
            const cols = targets.filter((t) => t.type === 'ResTarget').map((t) => propStr(t, 'name') ?? '');
            const colList: Doc = cols.length > 0 ? [' (', join(', ', cols), ')'] : '';
            const valList: Doc = values.length > 0
                ? [mk('VALUES'), ' (', join(', ', values.map(printNode)), ')']
                : [mk('DEFAULT VALUES')];
            actionDoc = [mk('INSERT'), colList, hardline, valList];
        }

        parts.push([whenLine, indent([hardline, actionDoc])]);
    }

    if (returning.length > 0) {
        parts.push([mk('RETURNING'), indent([hardline, join(hardSep(opts), returning.map(printNode))])]);
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// ALTER FUNCTION / PROCEDURE
// ---------------------------------------------------------------------------

function printAlterFunction(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const rename   = propStr(node, 'rename');
    const options  = (node.props?.['options'] as Array<{ name: string; value: string }> | undefined) ?? [];

    const argList: Doc = argTypes.length > 0
        ? ['(', join(', ', argTypes.map((t) => mk(t))), ')']
        : '()';

    if (rename) {
        return [[mk('ALTER FUNCTION'), ' ', name, argList, ' ', mk('RENAME TO'), ' ', rename], ';'];
    }

    const optionDocs = options.map((o) => [mk('SET'), ' ', o.name, ' ', o.value || ''] as Doc);
    return [[mk('ALTER FUNCTION'), ' ', name, argList, indent([hardline, join(hardline, optionDocs)])], ';'];
}

// ---------------------------------------------------------------------------
// REFRESH MATERIALIZED VIEW
// ---------------------------------------------------------------------------

function printRefreshMatView(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const name       = prop(node, 'name');
    const concurrent = propBool(node, 'concurrent');

    return [
        mk('REFRESH MATERIALIZED VIEW'),
        concurrent ? [' ', mk('CONCURRENTLY')] : '',
        ' ', rangeVarName(name),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// SELECT INTO
// ---------------------------------------------------------------------------

function printSelectInto(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
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
    parts.push([mk('SELECT'), indent([hardline, join(hardSep(opts), targets.map(printNode))])]);

    const intoKw: Doc = temp ? [mk('INTO'), ' ', mk('TEMP')] : mk('INTO');
    parts.push([intoKw, indent([hardline, rangeVarName(into)])]);

    if (from.length > 0) {
        parts.push([mk('FROM'), indent([hardline, join([',', hardline], from.map(printNode))])]);
    }
    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));
    if (groupBy.length > 0) {
        parts.push([mk('GROUP BY'), indent([hardline, join(hardSep(opts), groupBy.map(printNode))])]);
    }
    if (having) parts.push(printBoolClause('HAVING', having, opts, printNode));
    if (orderBy.length > 0) {
        parts.push([mk('ORDER BY'), indent([hardline, join(hardSep(opts), orderBy.map(printNode))])]);
    }
    if (limit)  parts.push([mk('LIMIT'), ' ', printNode(limit)]);
    if (offset) parts.push([mk('OFFSET'), ' ', printNode(offset)]);

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// CREATE RULE
// ---------------------------------------------------------------------------

function printRule(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const ruleName = propStr(node, 'ruleName') ?? '';
    const relation = prop(node, 'relation');
    const event    = propStr(node, 'event') ?? 'SELECT';
    const instead  = propBool(node, 'instead');
    const doInstead = propBool(node, 'doInstead');
    const where    = prop(node, 'where');
    const actions  = propArr(node, 'actions');

    const parts: Doc[] = [];
    parts.push([mk('CREATE RULE'), ' ', ruleName]);
    parts.push([mk('AS ON'), ' ', mk(event)]);
    parts.push([mk('TO'), ' ', rangeVarName(relation)]);

    if (where) parts.push(printBoolClause('WHERE', where, opts, printNode));

    const doKw: Doc = instead ? mk('DO INSTEAD') : doInstead ? mk('DO ALSO') : mk('DO ALSO');

    if (actions.length === 0) {
        parts.push([doKw, ' ', mk('NOTHING')]);
    } else if (actions.length === 1) {
        const action = actions[0]!;
        if (action.type === 'NothingStmt') {
            parts.push([doKw, ' ', mk('NOTHING')]);
        } else {
            parts.push([doKw, indent([hardline, printQueryExpr(action, opts)])]);
        }
    } else {
        const actionDocs = actions.map((a) =>
            a.type === 'NothingStmt' ? mk('NOTHING') : printQueryExpr(a, opts)
        );
        parts.push([doKw, ' (', indent([hardline, join([';', hardline], actionDocs)]), hardline, ')']);
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// Row Security Policies
// ---------------------------------------------------------------------------

function printCreatePolicy(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const policyName = propStr(node, 'policyName') ?? '';
    const table    = prop(node, 'table');
    const cmdName  = propStr(node, 'cmdName');
    const permissive = node.props?.['permissive'];  // false = RESTRICTIVE, null = PERMISSIVE (default)
    const using    = prop(node, 'using');
    const withCheck = prop(node, 'withCheck');

    const parts: Doc[] = [];
    parts.push([mk('CREATE POLICY'), ' ', policyName]);

    const onPart: Doc = permissive === false
        ? [mk('AS'), ' ', mk('RESTRICTIVE'), ' ', mk('ON'), ' ', rangeVarName(table)]
        : [mk('ON'), ' ', rangeVarName(table)];
    parts.push(onPart);

    if (cmdName) parts.push([mk('FOR'), ' ', mk(cmdName)]);
    if (using) parts.push([mk('USING'), ' (', printNode(using), ')']);
    if (withCheck) parts.push([mk('WITH CHECK'), ' (', printNode(withCheck), ')']);

    return [join(hardline, parts), ';'];
}

function printAlterPolicy(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const policyName = propStr(node, 'policyName') ?? '';
    const table    = prop(node, 'table');
    const using    = prop(node, 'using');
    const withCheck = prop(node, 'withCheck');

    const parts: Doc[] = [];
    parts.push([mk('ALTER POLICY'), ' ', policyName]);
    parts.push([mk('ON'), ' ', rangeVarName(table)]);
    if (using) parts.push([mk('USING'), ' (', printNode(using), ')']);
    if (withCheck) parts.push([mk('WITH CHECK'), ' (', printNode(withCheck), ')']);

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

function printDeclareCursor(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const scroll   = propBool(node, 'scroll');
    const noScroll = propBool(node, 'noScroll');
    const insensitive = propBool(node, 'insensitive');
    const binary   = propBool(node, 'binary');
    const query    = prop(node, 'query');

    const scrollKw: Doc = noScroll ? [' ', mk('NO SCROLL')] : scroll ? [' ', mk('SCROLL')] : '';
    const binaryKw: Doc = binary ? [mk('BINARY'), ' '] : '';
    const insensKw: Doc = insensitive ? [mk('INSENSITIVE'), ' '] : '';

    return [
        [mk('DECLARE'), ' ', name, scrollKw, ' ', insensKw, binaryKw, mk('CURSOR'), ' ', mk('FOR')],
        hardline,
        query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

function printFetch(node: SqlNode, opts: Options): Doc {
    const mk        = (k: string) => keyword(k, opts);
    const direction = propStr(node, 'direction') ?? 'NEXT';
    const count     = node.props?.['count'] as number | undefined;
    const cursor    = propStr(node, 'cursor') ?? '';
    const isMove    = propBool(node, 'isMove');

    const verb: Doc = isMove ? mk('MOVE') : mk('FETCH');

    let dirDoc: Doc;
    if (count !== undefined && count !== null && direction !== 'ALL') {
        // FETCH FORWARD 10 / FETCH ABSOLUTE 5 etc.
        dirDoc = [mk(direction), ' ', String(count)];
    } else {
        dirDoc = mk(direction);
    }

    return [[verb, ' ', dirDoc, ' ', mk('FROM'), ' ', cursor], ';'];
}

function printClosePortal(node: SqlNode, opts: Options): Doc {
    const mk     = (k: string) => keyword(k, opts);
    const cursor = propStr(node, 'cursor');
    return [[mk('CLOSE'), ' ', cursor ?? mk('ALL')], ';'];
}

// ---------------------------------------------------------------------------
// COPY
// ---------------------------------------------------------------------------

function printCopy(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
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

    const dirKw = isFrom ? mk('FROM') : mk('TO');
    let dest: Doc;
    if (isProgram && filename) {
        dest = [mk('PROGRAM'), ' ', `'${filename}'`];
    } else if (filename) {
        dest = `'${filename}'`;
    } else {
        dest = mk('STDOUT');
    }

    let optionPart: Doc = '';
    if (options.length > 0) {
        const optDocs = options.map((o) => [mk(o.name.toUpperCase()), ' ', o.value || ''] as Doc);
        optionPart = [' (', join(', ', optDocs), ')'];
    }

    return [[mk('COPY'), ' ', sourceDest, ' ', dirKw, ' ', dest, optionPart], ';'];
}

// ---------------------------------------------------------------------------
// EXPLAIN
// ---------------------------------------------------------------------------

function printExplain(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const query   = prop(node, 'query');
    const options  = (node.props?.['options'] as Array<{ name: string; value: string }> | undefined) ?? [];

    // Simple cases: no options at all, or just ANALYZE
    const analyzeOnly = options.length === 1 && options[0]!.name === 'analyze';
    const verboseOnly = options.length === 1 && options[0]!.name === 'verbose';

    if (options.length === 0) {
        return [[mk('EXPLAIN'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    if (analyzeOnly) {
        return [[mk('EXPLAIN'), ' ', mk('ANALYZE'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    if (verboseOnly) {
        return [[mk('EXPLAIN'), ' ', mk('VERBOSE'), ' ', query ? printQueryExpr(query, opts) : ''], ';'];
    }

    const optDocs = options.map((o) => {
        const val = o.value === 'true' ? mk('true') : o.value === 'false' ? mk('false') : o.value;
        return [mk(o.name.toUpperCase()), ' ', val] as Doc;
    });

    return [[mk('EXPLAIN'), ' (', join(', ', optDocs), ') ', query ? printQueryExpr(query, opts) : ''], ';'];
}

// ---------------------------------------------------------------------------
// PREPARE / EXECUTE / DEALLOCATE
// ---------------------------------------------------------------------------

function printPrepare(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const query    = prop(node, 'query');

    const argsPart: Doc = argTypes.length > 0
        ? ['(', join(', ', argTypes.map((t) => mk(t))), ')']
        : '';

    return [
        [mk('PREPARE'), ' ', name, argsPart, ' ', mk('AS')],
        hardline,
        query ? printQueryExpr(query, opts) : '',
        ';',
    ];
}

function printExecute(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const printNode = pn(opts);
    const name    = propStr(node, 'name') ?? '';
    const params  = propArr(node, 'params');

    const paramsPart: Doc = params.length > 0
        ? ['(', join(', ', params.map(printNode)), ')']
        : '';

    return [[mk('EXECUTE'), ' ', name, paramsPart], ';'];
}

function printDeallocate(node: SqlNode, opts: Options): Doc {
    const mk   = (k: string) => keyword(k, opts);
    const name = propStr(node, 'name');
    return [[mk('DEALLOCATE'), ' ', name ? name : mk('ALL')], ';'];
}

// ---------------------------------------------------------------------------
// LISTEN / UNLISTEN / NOTIFY
// ---------------------------------------------------------------------------

function printListen(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel') ?? '';
    return [[mk('LISTEN'), ' ', channel], ';'];
}

function printUnlisten(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel');
    return [[mk('UNLISTEN'), ' ', channel ? channel : '*'], ';'];
}

function printNotify(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const channel = propStr(node, 'channel') ?? '';
    const payload = propStr(node, 'payload');
    const payloadPart: Doc = payload ? [', ', `'${payload}'`] : '';
    return [[mk('NOTIFY'), ' ', channel, payloadPart], ';'];
}

// ---------------------------------------------------------------------------
// LOCK TABLE
// ---------------------------------------------------------------------------

function printLockTable(node: SqlNode, opts: Options): Doc {
    const mk        = (k: string) => keyword(k, opts);
    const relations = propArr(node, 'relations');
    const mode      = propStr(node, 'mode') ?? 'ACCESS EXCLUSIVE';
    const nowait    = propBool(node, 'nowait');

    return [
        mk('LOCK TABLE'), ' ', join(', ', relations.map(rangeVarName)),
        ' ', mk('IN'), ' ', mk(mode), ' ', mk('MODE'),
        nowait ? [' ', mk('NOWAIT')] : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: CREATE TABLE PARTITION OF
// ---------------------------------------------------------------------------

function printCreateTablePartitionOf(node: SqlNode, opts: Options): Doc {
    const mk     = (k: string) => keyword(k, opts);
    const name   = prop(node, 'name');
    const parent = prop(node, 'parent');
    const bound  = prop(node, 'bound');

    let boundDoc: Doc = '';
    if (bound) {
        const isDefault = propBool(bound, 'isDefault');
        if (isDefault) {
            boundDoc = [hardline, mk('DEFAULT')];
        } else {
            const lower = (bound.props?.['lower'] as string[] | undefined) ?? [];
            const upper = (bound.props?.['upper'] as string[] | undefined) ?? [];
            if (lower.length > 0 || upper.length > 0) {
                boundDoc = [
                    hardline, mk('FOR VALUES FROM'),
                    ' (', join(', ', lower), ')',
                    ' ', mk('TO'),
                    ' (', join(', ', upper), ')',
                ];
            }
        }
    }

    return [
        mk('CREATE TABLE'), ' ', rangeVarName(name), hardline,
        indent([mk('PARTITION OF'), ' ', rangeVarName(parent)]),
        boundDoc,
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: VACUUM / ANALYZE / CLUSTER / REINDEX
// ---------------------------------------------------------------------------

function printVacuum(node: SqlNode, opts: Options): Doc {
    const mk        = (k: string) => keyword(k, opts);
    const isVacuum  = propBool(node, 'isVacuum');
    const options   = (node.props?.['options'] as string[] | undefined) ?? [];
    const relations = propArr(node, 'relations');

    const relDoc: Doc = relations.length > 0
        ? [' ', join(', ', relations.map(rangeVarName))]
        : '';

    if (!isVacuum) {
        return [[mk('ANALYZE'), relDoc], ';'];
    }

    if (options.length === 0) {
        return [[mk('VACUUM'), relDoc], ';'];
    }
    if (options.length === 1 && (options[0] === 'VERBOSE' || options[0] === 'ANALYZE')) {
        return [[mk('VACUUM'), ' ', mk(options[0]!), relDoc], ';'];
    }
    return [[mk('VACUUM'), ' (', join(', ', options.map((o) => mk(o.toLowerCase()))), ')', relDoc], ';'];
}

function printCluster(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const relation = prop(node, 'relation');
    const indexName = propStr(node, 'indexName');

    return [
        [mk('CLUSTER'), ' ', rangeVarName(relation),
         indexName ? [' ', mk('USING'), ' ', indexName] : ''],
        ';',
    ];
}

function printReindex(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const kind     = propStr(node, 'kind') ?? 'TABLE';
    const relation = prop(node, 'relation');
    const options  = (node.props?.['options'] as string[] | undefined) ?? [];

    const optDoc: Doc = options.length > 0
        ? [' (', join(', ', options.map((o) => mk(o.toLowerCase()))), ')']
        : '';

    return [
        [mk('REINDEX'), optDoc, ' ', mk(kind), ' ', rangeVarName(relation)],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Foreign Data Wrappers
// ---------------------------------------------------------------------------

function printFdwOptions(node: SqlNode, opts: Options): Doc {
    const mk = (k: string) => keyword(k, opts);
    const options = propArr(node, 'options');
    if (options.length === 0) return '';
    const pairs = options.map((o) => {
        const key = propStr(o, 'key') ?? '';
        const val = propStr(o, 'val') ?? '';
        return [key, " '", val, "'"].join('') as Doc;
    });
    return [' ', mk('OPTIONS'), ' (', join(', ', pairs), ')'];
}

function printCreateForeignServer(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const fdwName = propStr(node, 'fdwName') ?? '';

    return [
        [mk('CREATE SERVER'), ' ', name, hardline,
         indent([mk('FOREIGN DATA WRAPPER'), ' ', fdwName]),
         printFdwOptions(node, opts)],
        ';',
    ];
}

function printCreateForeignTable(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const printNode  = pn(opts);
    const name       = prop(node, 'name');
    const columns    = propArr(node, 'columns');
    const serverName = propStr(node, 'serverName') ?? '';

    return [
        mk('CREATE FOREIGN TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ')',
        hardline, indent([mk('SERVER'), ' ', serverName]),
        printFdwOptions(node, opts),
        ';',
    ];
}

function printCreateUserMapping(node: SqlNode, opts: Options): Doc {
    const mk         = (k: string) => keyword(k, opts);
    const user       = propStr(node, 'user') ?? '';
    const serverName = propStr(node, 'serverName') ?? '';

    return [
        [mk('CREATE USER MAPPING FOR'), ' ', mk(user), hardline,
         indent([mk('SERVER'), ' ', serverName]),
         printFdwOptions(node, opts)],
        ';',
    ];
}

function printImportForeignSchema(node: SqlNode, opts: Options): Doc {
    const mk           = (k: string) => keyword(k, opts);
    const remoteSchema = propStr(node, 'remoteSchema') ?? '';
    const serverName   = propStr(node, 'serverName') ?? '';
    const localSchema  = propStr(node, 'localSchema') ?? '';

    return [
        [mk('IMPORT FOREIGN SCHEMA'), ' ', remoteSchema, hardline,
         mk('FROM SERVER'), ' ', serverName, hardline,
         mk('INTO'), ' ', localSchema],
        ';',
    ];
}

// ---------------------------------------------------------------------------
// P4: Logical Replication
// ---------------------------------------------------------------------------

function printCreatePublication(node: SqlNode, opts: Options): Doc {
    const mk     = (k: string) => keyword(k, opts);
    const name   = propStr(node, 'name') ?? '';
    const tables = propArr(node, 'tables');
    const forAll = propBool(node, 'forAllTables');

    let forPart: Doc;
    if (forAll) {
        forPart = [' ', mk('FOR ALL TABLES')];
    } else if (tables.length > 0) {
        forPart = [hardline, indent([mk('FOR TABLE'), ' ', join(', ', tables.map(rangeVarName))])];
    } else {
        forPart = '';
    }

    return [[mk('CREATE PUBLICATION'), ' ', name, forPart], ';'];
}

function printCreateSubscription(node: SqlNode, opts: Options): Doc {
    const mk           = (k: string) => keyword(k, opts);
    const name         = propStr(node, 'name') ?? '';
    const conninfo     = propStr(node, 'conninfo') ?? '';
    const publications = (node.props?.['publications'] as string[] | undefined) ?? [];

    return [
        [mk('CREATE SUBSCRIPTION'), ' ', name, hardline,
         indent([mk('CONNECTION'), " '", conninfo, "'"]), hardline,
         indent([mk('PUBLICATION'), ' ', join(', ', publications)])],
        ';',
    ];
}

function printDropSubscription(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');

    return [
        [mk('DROP SUBSCRIPTION'), ifExists ? [' ', mk('IF EXISTS')] : '', ' ', name],
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
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const argTypes = (node.props?.['argTypes'] as string[] | undefined) ?? [];
    const options  = propArr(node, 'options');

    return [
        mk('CREATE AGGREGATE'), ' ', name, ' (', join(', ', argTypes.map((t) => mk(t))), ') (',
        indent([hardline, printDefOptions(options, opts)]),
        hardline, ');',
    ];
}

function printCreateOperator(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const name    = propStr(node, 'name') ?? '';
    const options = propArr(node, 'options');

    return [
        mk('CREATE OPERATOR'), ' ', name, ' (',
        indent([hardline, printDefOptions(options, opts)]),
        hardline, ');',
    ];
}

function printCreateCollation(node: SqlNode, opts: Options): Doc {
    const mk       = (k: string) => keyword(k, opts);
    const name     = propStr(node, 'name') ?? '';
    const fromName = propStr(node, 'fromName');
    const options  = propArr(node, 'options');

    if (fromName) {
        return [[mk('CREATE COLLATION'), ' ', name, ' ', mk('FROM'), ' ', `"${fromName}"`], ';'];
    }

    return [
        mk('CREATE COLLATION'), ' ', name, ' (',
        printDefOptions(options, opts),
        ');',
    ];
}

// ---------------------------------------------------------------------------
// P4: Security Labels
// ---------------------------------------------------------------------------

function printSecurityLabel(node: SqlNode, opts: Options): Doc {
    const mk      = (k: string) => keyword(k, opts);
    const provider = propStr(node, 'provider') ?? '';
    const objType  = propStr(node, 'objType') ?? 'table';
    const objName  = propStr(node, 'objName') ?? '';
    const label    = propStr(node, 'label') ?? '';

    return [
        [mk('SECURITY LABEL FOR'), ' ', provider, ' ', mk('ON'), ' ', mk(objType), ' ', objName, ' ', mk('IS'), " '", label, "'"],
        ';',
    ];
}
