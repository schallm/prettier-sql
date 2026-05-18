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
    commentsBlock,
} from './utils.js';
import { prop, propArr, propStr, propBool, rangeVarName } from './helpers.js';
import { printExpression } from './expressions.js';

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
    const leading = commentsBlock(node.leadingComments);
    const body = printStatement(node, opts);
    const trailing = node.trailingComment ? [' ', node.trailingComment] : '';
    return leading ? [leading, hardline, body, trailing] : [body, trailing];
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
        return [name, ' ', mk('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
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

    return [
        mk('CREATE TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], columns.map(printNode))]),
        hardline, ');',
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

    return [
        mk('CREATE FUNCTION'), ' ', name,
        '(', join(', ', parameters.map(printNode)), ')',
        ';',
    ];
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
