import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, hardline, join, indent, hardSep, commentsBlock } from './utils.js';
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
        case 'SelectStatement': return printSelect(node, opts);
        case 'InsertStatement': return printInsert(node, opts);
        case 'UpdateStatement': return printUpdate(node, opts);
        case 'DeleteStatement': return printDelete(node, opts);
        case 'CreateTableStatement': return printCreateTable(node, opts);
        case 'AlterTableStatement': return printAlterTable(node, opts);
        case 'CreateViewStatement': return printCreateView(node, opts);
        case 'CreateFunctionStatement': return printCreateFunction(node, opts);
        case 'CreateIndexStatement': return printCreateIndex(node, opts);
        case 'DropStatement': return printDrop(node, opts);
        default: return node.text ?? node.type;
    }
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

function printSelect(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const ctes = prop(node, 'ctes');
    const distinct = propBool(node, 'distinct');
    const targetList = propArr(node, 'targetList');
    const from = propArr(node, 'from');
    const where = prop(node, 'where');
    const groupBy = propArr(node, 'groupBy');
    const having = prop(node, 'having');
    const orderBy = propArr(node, 'orderBy');
    const limit = prop(node, 'limit');
    const offset = prop(node, 'offset');

    const parts: Doc[] = [];

    if (ctes) {
        const cteList = propArr(ctes, 'ctes');
        const recursive = propBool(ctes, 'recursive');
        const cteKw = recursive ? mk('WITH RECURSIVE') : mk('WITH');
        const cteDocs = cteList.map((cte) => {
            const cteName = propStr(cte, 'name') ?? '';
            const cteQuery = prop(cte, 'query');
            return [cteName, ' ', mk('AS'), ' (', indent([hardline, cteQuery ? printNode(cteQuery) : '']), hardline, ')'];
        });
        parts.push([cteKw, indent([hardline, join([',', hardline], cteDocs)])]);
    }

    const selectKw = distinct ? [mk('SELECT'), ' ', mk('DISTINCT')] : mk('SELECT');
    if (targetList.length === 1) {
        parts.push([selectKw, ' ', printNode(targetList[0]!)]);
    } else {
        parts.push([selectKw, indent([hardline, join(hardSep(opts), targetList.map(printNode))])]);
    }

    if (from.length > 0) {
        const fromDocs = from.map(printNode);
        if (fromDocs.length === 1) {
            parts.push([mk('FROM'), ' ', fromDocs[0]!]);
        } else {
            parts.push([mk('FROM'), indent([hardline, join([',', hardline], fromDocs)])]);
        }
    }

    if (where) {
        parts.push(printWhereClause(where, opts, printNode));
    }

    if (groupBy.length > 0) {
        parts.push([mk('GROUP BY'), ' ', join([', '], groupBy.map(printNode))]);
    }

    if (having) {
        parts.push([mk('HAVING'), ' ', printNode(having)]);
    }

    if (orderBy.length > 0) {
        if (orderBy.length === 1) {
            parts.push([mk('ORDER BY'), ' ', printNode(orderBy[0]!)]);
        } else {
            parts.push([mk('ORDER BY'), indent([hardline, join(hardSep(opts), orderBy.map(printNode))])]);
        }
    }

    if (limit) {
        parts.push([mk('LIMIT'), ' ', printNode(limit)]);
    }

    if (offset) {
        parts.push([mk('OFFSET'), ' ', printNode(offset)]);
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

function printInsert(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const target = prop(node, 'target');
    const columns = propArr(node, 'columns');
    const source = prop(node, 'source');

    const targetName = rangeVarName(target);
    const colList = columns.length > 0
        ? [' (', join(', ', columns.map((c) => propStr(c, 'name') ?? '')), ')']
        : '';

    const parts: Doc[] = [
        [mk('INSERT INTO'), ' ', targetName, colList],
    ];

    if (source) {
        parts.push(printNode(source));
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function printUpdate(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const target = prop(node, 'target');
    const sets = propArr(node, 'sets');
    const from = propArr(node, 'from');
    const where = prop(node, 'where');

    const parts: Doc[] = [
        [mk('UPDATE'), ' ', rangeVarName(target)],
        [mk('SET'), indent([hardline, join(hardSep(opts), sets.map((s) => {
            const name = propStr(s, 'name') ?? '';
            const val = prop(s, 'val');
            return [name, ' = ', val ? printNode(val) : ''];
        }))])],
    ];

    if (from.length > 0) {
        parts.push([mk('FROM'), ' ', join([', '], from.map(printNode))]);
    }

    if (where) {
        parts.push(printWhereClause(where, opts, printNode));
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

function printDelete(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const target = prop(node, 'target');
    const using = propArr(node, 'using');
    const where = prop(node, 'where');

    const parts: Doc[] = [
        [mk('DELETE FROM'), ' ', rangeVarName(target)],
    ];

    if (using.length > 0) {
        parts.push([mk('USING'), ' ', join([', '], using.map(printNode))]);
    }

    if (where) {
        parts.push(printWhereClause(where, opts, printNode));
    }

    return [join(hardline, parts), ';'];
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

function printCreateTable(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const name = prop(node, 'name');
    const columns = propArr(node, 'columns');

    const colDocs = columns.map(printNode);
    return [
        mk('CREATE TABLE'), ' ', rangeVarName(name), ' (',
        indent([hardline, join([',', hardline], colDocs)]),
        hardline, ');',
    ];
}

function printAlterTable(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const name = prop(node, 'name');
    const commands = propArr(node, 'commands');

    return [
        mk('ALTER TABLE'), ' ', rangeVarName(name),
        indent([hardline, join([',', hardline], commands.map(printNode))]),
        ';',
    ];
}

function printCreateView(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const name = prop(node, 'name');
    const body = prop(node, 'body');

    return [
        mk('CREATE VIEW'), ' ', rangeVarName(name), hardline,
        mk('AS'), hardline,
        body ? printNode(body) : '',
    ];
}

function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const name = propStr(node, 'name') ?? '';
    const parameters = propArr(node, 'parameters');

    return [
        mk('CREATE FUNCTION'), ' ', name,
        '(', join(', ', parameters.map(printNode)), ')',
        ';',
    ];
}

function printCreateIndex(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    function printNode(n: SqlNode): Doc { return printExpression(n, opts, printNode); }

    const unique = propBool(node, 'unique');
    const indexName = propStr(node, 'indexName') ?? '';
    const relation = prop(node, 'relation');
    const columns = propArr(node, 'columns');

    return [
        unique ? [mk('CREATE UNIQUE INDEX'), ' '] : [mk('CREATE INDEX'), ' '],
        indexName, ' ', mk('ON'), ' ', rangeVarName(relation),
        ' (', join(', ', columns.map(printNode)), ');',
    ];
}

function printDrop(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const objectType = propStr(node, 'objectType') ?? '';
    const ifExists = propBool(node, 'ifExists');
    const cascade = propBool(node, 'cascade');

    return [
        mk('DROP'), ' ', objectType,
        ifExists ? [' ', mk('IF EXISTS')] : '',
        cascade ? [' ', mk('CASCADE')] : '',
        ';',
    ];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function printWhereClause(where: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    return [mk('WHERE'), ' ', printNode(where)];
}
