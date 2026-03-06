import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, getDensity, hardline, join, indent, group, line, softline, lineSuffix } from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName, assignmentOp } from './helpers.js';
import {
    printExpression,
    printBoolExpr,
    printTableRef,
    printOrderByClause,
    printQueryExpression,
} from './expressions.js';

/** Print a node via the expression dispatcher (no path needed for inner nodes) */
function printNode(node: SqlNode, opts: Options): Doc {
    return printExpression(node, opts, (n) => printNode(n, opts));
}

/**
 * Append a trailing comment to a doc.
 * Line comments (--) stay on the same line via lineSuffix.
 * Block comments go on their own line(s) after the doc.
 */
function appendTrailingComment(doc: Doc, comment: string | undefined): Doc {
    if (!comment) return doc;
    if (comment.startsWith('--')) return [doc, lineSuffix([' ', comment])];
    return [doc, ...comment.split('\n').flatMap((c): Doc[] => [hardline, c])];
}

/**
 * Print a statement together with any leading comments (above it) and
 * trailing comment (after it).  Used for both top-level and inner statements.
 */
function printStatementWithComments(s: SqlNode, opts: Options): Doc {
    const stmtDoc = printStatement(s, opts);
    const withTrailing = appendTrailingComment(stmtDoc, s.trailingComment);
    if (s.leadingComments?.length) {
        return [
            ...s.leadingComments.flatMap((c): Doc[] => [c, hardline]),
            withTrailing,
        ] as Doc;
    }
    return withTrailing;
}

function printBool(node: SqlNode, opts: Options): Doc {
    return printBoolExpr(node, opts, (n) => printNode(n, opts));
}

// Walk to the rightmost non-BooleanBinary leaf (mirrors the one in expressions.ts).
function rightmostBoolLeaf(node: SqlNode | null | undefined): SqlNode | null {
    if (!node) return null;
    if (node.type === 'BooleanBinary') return rightmostBoolLeaf(prop(node, 'right'));
    return node;
}

// Append any trailing comment that lives on the rightmost predicate leaf.
// This catches: (a) single-predicate WHERE with a comment below it, and
// (b) a comment after the last active predicate in a multi-predicate WHERE.
function printBoolDoc(where: SqlNode, opts: Options): Doc {
    const base = printBool(where, opts);
    const trailing = rightmostBoolLeaf(where)?.trailingComment;
    if (!trailing) return base;
    return [base, ...trailing.split('\n').flatMap((c): Doc[] => [hardline, c])];
}

function printTable(node: SqlNode, opts: Options): Doc {
    return printTableRef(node, opts, (n) => printNode(n, opts));
}

// ---------------------------------------------------------------------------
// Script / Batch
// ---------------------------------------------------------------------------

// Statement types that must be the only statement in their batch.
const BATCH_ISOLATING = new Set([
    'CreateViewStatement', 'AlterViewStatement', 'CreateOrAlterViewStatement',
    'CreateProcedureStatement', 'CreateOrAlterProcedureStatement', 'AlterProcedureStatement',
    'CreateFunctionStatement', 'AlterFunctionStatement', 'CreateOrAlterFunctionStatement',
    'CreateTriggerStatement', 'AlterTriggerStatement',
]);

export function printScript(node: SqlNode, opts: Options): Doc {
    const batches = propArr(node, 'batches');
    if (batches.length === 0) return '';

    const go = keyword('go', opts);

    // When the input already used GO, emit it between batches.
    // Also emit it after batches that contain an isolating statement.
    const parts: Doc[] = [];
    for (let i = 0; i < batches.length; i++) {
        if (i > 0) parts.push(hardline, hardline);
        parts.push(printBatch(batches[i]!, opts));
        const stmts = propArr(batches[i]!, 'statements');
        const needsGo = batches.length > 1
            || stmts.some(s => BATCH_ISOLATING.has(s.type));
        if (needsGo) parts.push(hardline, go);
    }
    return parts;
}

function printBatch(node: SqlNode, opts: Options): Doc {
    const stmts = propArr(node, 'statements');
    if (stmts.length === 0) return '';
    return join([hardline, hardline], stmts.map((s) => printStatementWithComments(s, opts)));
}

// ---------------------------------------------------------------------------
// Statement dispatcher
// ---------------------------------------------------------------------------

export function printStatement(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'SelectStatement':         return printSelect(node, opts);
        case 'InsertStatement':         return printInsert(node, opts);
        case 'UpdateStatement':         return printUpdate(node, opts);
        case 'DeleteStatement':         return printDelete(node, opts);
        case 'CreateTableStatement':    return printCreateTable(node, opts);
        case 'AlterTableStatement':     return printAlterTable(node, opts);
        case 'CreateIndexStatement':    return printCreateIndex(node, opts);
        case 'CreateProcedureStatement':
        case 'AlterProcedureStatement':
        case 'CreateOrAlterProcedureStatement': return printCreateProcedure(node, opts);
        case 'CreateFunctionStatement':
        case 'AlterFunctionStatement':
        case 'CreateOrAlterFunctionStatement':  return printCreateFunction(node, opts);
        case 'CreateViewStatement':
        case 'AlterViewStatement':
        case 'CreateOrAlterViewStatement': return printCreateView(node, opts);
        case 'BeginEndBlock': {
            const stmts = propArr(node, 'statements');
            return join([hardline, hardline], stmts.map((s) => printStatementWithComments(s, opts)));
        }
        case 'BeginTransactionStatement': return printBeginTransaction(node, opts);
        case 'CommitTransactionStatement': return printCommitTransaction(node, opts);
        case 'RollbackTransactionStatement': return printRollbackTransaction(node, opts);
        case 'DeclareVariableStatement':    return printDeclareVariable(node, opts);
        case 'DeclareTableVariableStatement': return printDeclareTableVariable(node, opts);
        case 'SetVariableStatement':        return printSetVariable(node, opts);
        case 'SetRowCountStatement':        return printSetRowCount(node, opts);
        case 'PrintStatement':              return printPrint(node, opts);
        case 'ReturnStatement':             return printReturn(node, opts);
        case 'IfStatement':                 return printIf(node, opts);
        case 'WhileStatement':              return printWhile(node, opts);
        case 'ExecuteStatement':            return printExecute(node, opts);
        case 'TruncateTableStatement':      return printTruncateTable(node, opts);
        case 'BreakStatement':              return [keyword('BREAK', opts), ';'];
        case 'ContinueStatement':           return [keyword('CONTINUE', opts), ';'];
        case 'GotoStatement':               return printGoto(node, opts);
        case 'LabelStatement':              return printLabel(node, opts);
        case 'ThrowStatement':              return printThrow(node, opts);
        case 'RaiseErrorStatement':         return printRaiseError(node, opts);
        case 'TryCatchStatement':           return printTryCatch(node, opts);
        case 'DropTableStatement':          return printDropObjects('TABLE', node, opts);
        case 'DropProcedureStatement':      return printDropObjects('PROCEDURE', node, opts);
        case 'DropViewStatement':           return printDropObjects('VIEW', node, opts);
        case 'DropFunctionStatement':       return printDropObjects('FUNCTION', node, opts);
        case 'DropIndexStatement':          return printDropIndex(node, opts);
        case 'MergeStatement':              return printMerge(node, opts);
        case 'UseStatement':                return printUse(node, opts);
        case 'PredicateSetStatement':       return printPredicateSet(node, opts);
        case 'SetStatisticsStatement':      return printSetStatistics(node, opts);
        case 'SetIdentityInsertStatement':  return printSetIdentityInsert(node, opts);
        case 'SetTransactionIsolationLevelStatement': return printSetIsolationLevel(node, opts);
        case 'WaitForStatement':            return printWaitFor(node, opts);
        // Trigger DDL
        case 'CreateTriggerStatement':
        case 'AlterTriggerStatement':      return printCreateTrigger(node, opts);
        case 'DropTriggerStatement':       return printDropObjects('TRIGGER', node, opts);
        // Index DDL
        case 'AlterIndexStatement':        return printAlterIndex(node, opts);
        // Cursor operations
        case 'DeclareCursorStatement':     return printDeclareCursor(node, opts);
        case 'OpenCursorStatement':        return printOpenCursor(node, opts);
        case 'FetchCursorStatement':       return printFetchCursor(node, opts);
        case 'CloseCursorStatement':       return printCloseCursor(node, opts);
        case 'DeallocateCursorStatement':  return printDeallocateCursor(node, opts);
        // Sequence DDL
        case 'CreateSequenceStatement':    return printCreateSequence(node, opts);
        case 'AlterSequenceStatement':     return printAlterSequence(node, opts);
        case 'DropSequenceStatement':      return printDropObjects('SEQUENCE', node, opts);
        // BULK INSERT
        case 'BulkInsertStatement':        return printBulkInsert(node, opts);
        // CREATE TYPE
        case 'CreateTypeUddtStatement':    return printCreateTypeUddt(node, opts);
        case 'CreateTypeTableStatement':   return printCreateTypeTable(node, opts);
        // Security / principal statements — preserved as-is (keywords not re-cased)
        case 'GrantStatement':
        case 'DenyStatement':
        case 'RevokeStatement':
        case 'CreateUserStatement':
        case 'AlterUserStatement':
        case 'DropUserStatement':
        case 'CreateLoginStatement':
        case 'AlterLoginStatement':
        case 'DropLoginStatement':
        case 'CreateRoleStatement':
        case 'AlterRoleStatement':
        case 'DropRoleStatement':
            return node.text ?? '';
        default:
            return node.text ?? `/* unhandled statement: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

/** Shorthand: print a query expression node using the local printFn. */
function qexpr(node: SqlNode, opts: Options): Doc {
    return printQueryExpression(node, opts, (n) => printNode(n, opts));
}

function printCtes(node: SqlNode, opts: Options): Doc[] {
    const ctes = propArr(node, 'ctes');
    if (ctes.length === 0) return [];

    const cteDocs = ctes.map((cte, i) => {
        const name = propStr(cte, 'name') ?? 'cte';
        const cols = cte.props?.['columns'] as string[] | undefined;
        const query = prop(cte, 'query');

        const colsPart: Doc = cols?.length
            ? [' (', join(', ', cols), ')']
            : '';

        return [
            i === 0 ? keyword('WITH', opts) + ' ' : '    ',
            name,
            colsPart,
            ' ',
            keyword('AS', opts),
            ' (',
            indent([hardline, query ? qexpr(query, opts) : '']),
            hardline,
            ')',
        ] as Doc;
    });

    return [join([',', hardline], cteDocs), hardline];
}

export function printSelect(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const queryExpr = prop(node, 'queryExpression');
    const orderBy = prop(node, 'orderBy');
    const optimizerHints = node.props?.['optimizerHints'] as string[] | undefined;

    const parts: Doc[] = [
        ...ctesDocs,
        queryExpr ? qexpr(queryExpr, opts) : '',
    ];

    if (orderBy) {
        parts.push(hardline, printOrderByClause(orderBy, opts, (n) => printNode(n, opts)));
    }

    if (optimizerHints?.length) {
        parts.push(hardline, keyword('OPTION', opts), ' (', join(', ', optimizerHints.map(h => keyword(h, opts))), ')');
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export function printInsert(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const target = prop(node, 'target');
    const columns = propArr(node, 'columns');
    const source = prop(node, 'source');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const colsPart: Doc = columns.length
        ? [
            ' (',
            indent([softline, join([',', line], columns.map((c) => printNode(c, opts)))]),
            softline,
            ')',
          ]
        : '';

    const targetDoc = target ? printTable(target, opts) : '';

    const sourcePart: Doc = source?.type === 'ValuesSource'
        ? printValuesSource(source, opts)
        : source
        ? [hardline, qexpr(source, opts)]
        : '';

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('INSERT INTO', opts),
        ' ',
        targetDoc,
        colsPart,
    ];

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    parts.push(sourcePart, ';');
    return group(parts);
}

function printValuesSource(node: SqlNode, opts: Options): Doc {
    const rows = node.props?.['rows'];
    if (!Array.isArray(rows)) return [hardline, keyword('VALUES', opts), ' ()'];

    const rowDocs = rows.map((row) => {
        const rowNode = row as SqlNode;
        const vals = propArr(rowNode, 'values').map((v) => printNode(v, opts));
        const rowDoc = group(['(', indent([softline, join([',', line], vals)]), softline, ')']);
        return rowNode.trailingComment
            ? [rowDoc, lineSuffix([' ', rowNode.trailingComment])]
            : rowDoc;
    });

    return [
        hardline,
        keyword('VALUES', opts),
        indent([hardline, join([',', hardline], rowDocs)]),
    ];
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export function printUpdate(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const density = getDensity(opts);
    const target = prop(node, 'target');
    const setClauses = propArr(node, 'set');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const setParts = setClauses.map((sc) => {
        const col = prop(sc, 'column');
        const val = prop(sc, 'value');
        const opStr = assignmentOp(propStr(sc, 'operator') ?? 'Equals');
        return [col ? printNode(col, opts) : '', ' ', opStr, ' ', val ? printNode(val, opts) : ''] as Doc;
    });

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('UPDATE', opts),
        ' ',
        target ? printTable(target, opts) : '',
        hardline,
        keyword('SET', opts),
        density !== 'spacious' && setParts.length === 1
            ? [' ', setParts[0]!]
            : indent([hardline, join([',', hardline], setParts)]),
    ];

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        parts.push(
            hardline,
            keyword('FROM', opts),
            indent([hardline, join([',', hardline], tableRefs.map((tr) => printTable(tr, opts)))])
        );
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (where) {
        const inline = density !== 'spacious' && where.type !== 'BooleanBinary';
        if (inline) {
            parts.push(hardline, keyword('WHERE', opts), ' ', printBoolDoc(where, opts));
        } else {
            parts.push(hardline, keyword('WHERE', opts), indent([hardline, printBoolDoc(where, opts)]));
        }
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export function printDelete(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const density = getDensity(opts);
    const target = prop(node, 'target');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('DELETE FROM', opts),
        ' ',
        target ? printTable(target, opts) : '',
    ];

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        parts.push(
            hardline,
            keyword('FROM', opts),
            indent([hardline, join([',', hardline], tableRefs.map((tr) => printTable(tr, opts)))])
        );
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (where) {
        const inline = density !== 'spacious' && where.type !== 'BooleanBinary';
        if (inline) {
            parts.push(hardline, keyword('WHERE', opts), ' ', printBoolDoc(where, opts));
        } else {
            parts.push(hardline, keyword('WHERE', opts), indent([hardline, printBoolDoc(where, opts)]));
        }
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

export function printCreateTable(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const colDocs = columns.map((col) => printColumnDef(col, opts));
    const conDocs = constraints.map((c) => printConstraintDef(c, opts));
    const allDefs = [...colDocs, ...conDocs];

    return group([
        keyword('CREATE TABLE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ');',
    ]);
}

function printColumnDef(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? 'col';
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const params = node.props?.['dataTypeParams'];
    // Read nullable as a tristate (true/false/undefined) rather than via propBool,
    // because we need to distinguish explicitly NULL from explicitly NOT NULL from omitted.
    const isNullable = node.props?.['nullable'];
    const isIdentity = propBool(node, 'identity');
    const identitySeed = propStr(node, 'identitySeed');
    const identityIncrement = propStr(node, 'identityIncrement');
    const defaultValue = prop(node, 'defaultValue');

    const typeStr: Doc = Array.isArray(params) && params.length > 0
        ? [keyword(dataType, opts), `(${(params as string[]).join(', ')})`]
        : keyword(dataType, opts);

    const parts: Doc[] = [name, ' ', typeStr];

    if (isIdentity) {
        const seed = identitySeed ?? '1';
        const inc = identityIncrement ?? '1';
        parts.push(' ', keyword('IDENTITY', opts), `(${seed}, ${inc})`);
    }

    if (defaultValue) {
        parts.push(' ', keyword('DEFAULT', opts), ' ', printNode(defaultValue, opts));
    }

    if (isNullable === false) {
        parts.push(' ', keyword('NOT NULL', opts));
    } else if (isNullable === true) {
        parts.push(' ', keyword('NULL', opts));
    }

    return parts;
}

function printConstraintDef(node: SqlNode, opts: Options): Doc {
    const constraintName = propStr(node, 'constraintName');
    const namePrefix: Doc = constraintName
        ? [keyword('CONSTRAINT', opts), ' ', constraintName, ' ']
        : '';

    switch (node.type) {
        case 'UniqueConstraint': {
            const isPK = propBool(node, 'isPrimaryKey');
            const cols = node.props?.['columns'];
            const colList = Array.isArray(cols) ? (cols as string[]).join(', ') : '';
            const kw = isPK ? keyword('PRIMARY KEY', opts) : keyword('UNIQUE', opts);
            return [namePrefix, kw, ' (', colList, ')'];
        }
        case 'CheckConstraint': {
            const expr = prop(node, 'expression');
            return [namePrefix, keyword('CHECK', opts), ' (', expr ? printBool(expr, opts) : '', ')'];
        }
        case 'ForeignKeyConstraint': {
            const cols = node.props?.['columns'];
            const refTable = prop(node, 'refTable');
            const refCols = node.props?.['refColumns'];
            const colList = Array.isArray(cols) ? (cols as string[]).join(', ') : '';
            const refColList = Array.isArray(refCols) ? (refCols as string[]).join(', ') : '';
            const refName = refTable ? [propStr(refTable, 'schema'), propStr(refTable, 'name')].filter(Boolean).join('.') : '';
            return [namePrefix, keyword('FOREIGN KEY', opts), ' (', colList, ') ',
                keyword('REFERENCES', opts), ' ', refName, ' (', refColList, ')'];
        }
        default:
            return node.text ?? `/* constraint: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// ALTER TABLE
// ---------------------------------------------------------------------------

export function printAlterTable(node: SqlNode, opts: Options): Doc {
    const alterType = propStr(node, 'alterType') ?? '';
    const name = schemaObjectName(prop(node, 'name'));

    if (alterType === 'AlterTableAddTableElementStatement') {
        const columns = propArr(node, 'columns');
        const constraints = propArr(node, 'constraints');
        const defs = [
            ...columns.map((c) => printColumnDef(c, opts)),
            ...constraints.map((c) => printConstraintDef(c, opts)),
        ];
        return group([
            keyword('ALTER TABLE', opts), ' ', name,
            hardline,
            keyword('ADD', opts),
            indent([hardline, join([',', hardline], defs)]),
            ';',
        ]);
    }

    if (alterType === 'AlterTableDropTableElementStatement') {
        const elements = node.props?.['elements'];
        const elemList = Array.isArray(elements) ? (elements as string[]).join(', ') : '';
        return group([
            keyword('ALTER TABLE', opts), ' ', name,
            hardline,
            keyword('DROP COLUMN', opts), ' ', elemList,
            ';',
        ]);
    }

    return [keyword('ALTER TABLE', opts), ' ', name, ' /* ', alterType, ' */;'];
}

// ---------------------------------------------------------------------------
// CREATE INDEX
// ---------------------------------------------------------------------------

export function printCreateIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName') ?? 'idx';
    const isUnique = propBool(node, 'unique');
    const isClustered = propBool(node, 'clustered');
    const table = prop(node, 'table');
    const columns = propArr(node, 'columns');
    const includeColumns = node.props?.['includeColumns'];

    const colDocs = columns.map((c) => {
        const name = propStr(c, 'name') ?? c.text ?? '';
        const sort = propStr(c, 'sortOrder') ?? 'Ascending';
        return sort === 'Descending'
            ? [name, ' ', keyword('DESC', opts)] as Doc
            : [name, ' ', keyword('ASC', opts)] as Doc;
    });

    const uniqueKw = isUnique ? keyword('UNIQUE ', opts) : '';
    const clusteredKw = isClustered ? keyword('CLUSTERED ', opts) : keyword('NONCLUSTERED ', opts);

    const parts: Doc[] = [
        keyword('CREATE ', opts), uniqueKw, clusteredKw,
        keyword('INDEX', opts), ' ', indexName,
        hardline,
        keyword('ON', opts), ' ', schemaObjectName(table),
        ' (', indent([softline, join([',', line], colDocs)]), softline, ')',
    ];

    if (Array.isArray(includeColumns) && includeColumns.length > 0) {
        const incCols = (includeColumns as string[]).join(', ');
        parts.push(hardline, keyword('INCLUDE', opts), ' (', incCols, ')');
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// CREATE PROCEDURE
// ---------------------------------------------------------------------------

export function printCreateProcedure(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const body = propArr(node, 'body');

    const paramDocs = parameters.map((p) => {
        const pName = propStr(p, 'name') ?? '@p';
        const dt = propStr(p, 'dataType') ?? 'INT';
        const isOutput = propBool(p, 'output');
        const isReadonly = propBool(p, 'readonly');
        const defaultVal = prop(p, 'defaultValue');
        const parts: Doc[] = [pName, ' ', keyword(dt, opts)];
        if (defaultVal) parts.push(' = ', printNode(defaultVal, opts));
        if (isOutput) parts.push(' ', keyword('OUTPUT', opts));
        if (isReadonly) parts.push(' ', keyword('READONLY', opts));
        return parts as Doc;
    });

    const bodyDocs = body.map((s) => printStatementWithComments(s, opts));

    const preBody: Doc = node.preBodyComments?.length
        ? (node.preBodyComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';
    const postParam: Doc = node.postParamComments?.length
        ? (node.postParamComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';

    const procKw =
        node.type === 'CreateOrAlterProcedureStatement' ? keyword('CREATE OR ALTER PROCEDURE', opts) :
        node.type === 'AlterProcedureStatement'         ? keyword('ALTER PROCEDURE', opts) :
                                                          keyword('CREATE PROCEDURE', opts);

    return group([
        procKw, ' ', schemaObjectName(prop(node, 'name')),
        preBody,
        parameters.length > 0
            ? indent([hardline, join([',', hardline], paramDocs)])
            : '',
        postParam,
        hardline,
        keyword('AS', opts),
        hardline,
        keyword('BEGIN', opts),
        indent([hardline, join([hardline, hardline], bodyDocs)]),
        hardline,
        keyword('END', opts),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function printTransaction(kw: string, node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name');
    return [keyword(kw, opts), ...(name ? [' ', name] : []), ';'];
}

function printBeginTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('BEGIN TRANSACTION', node, opts);
}

function printCommitTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('COMMIT TRANSACTION', node, opts);
}

function printRollbackTransaction(node: SqlNode, opts: Options): Doc {
    return printTransaction('ROLLBACK TRANSACTION', node, opts);
}

// ---------------------------------------------------------------------------
// DECLARE
// ---------------------------------------------------------------------------

function printDeclareVariable(node: SqlNode, opts: Options): Doc {
    const decls = propArr(node, 'declarations');
    const declDocs = decls.map((d) => {
        const name = propStr(d, 'name') ?? '@var';
        const dt = propStr(d, 'dataType') ?? 'INT';
        const params = d.props?.['dataTypeParams'];
        const typeStr: Doc = Array.isArray(params) && params.length > 0
            ? [keyword(dt, opts), `(${(params as string[]).join(', ')})`]
            : keyword(dt, opts);
        const val = prop(d, 'value');
        return [keyword('DECLARE', opts), ' ', name, ' ', typeStr, ...(val ? [' = ', printNode(val, opts)] : []), ';'] as Doc;
    });
    return join(hardline, declDocs);
}

function printDeclareTableVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@t';
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const allDefs = [
        ...columns.map((c) => printColumnDef(c, opts)),
        ...constraints.map((c) => printConstraintDef(c, opts)),
    ];
    return group([
        keyword('DECLARE', opts), ' ', name, ' ', keyword('TABLE', opts), ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline, ');',
    ]);
}

// ---------------------------------------------------------------------------
// SET
// ---------------------------------------------------------------------------

function printSetVariable(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '@var';
    const val = prop(node, 'value');
    const opStr = assignmentOp(propStr(node, 'operator') ?? 'Equals');
    return [keyword('SET', opts), ' ', name, ' ', opStr, ' ', val ? printNode(val, opts) : '', ';'];
}

function printSetRowCount(node: SqlNode, opts: Options): Doc {
    const rows = prop(node, 'rows');
    return [keyword('SET', opts), ' ', keyword('ROWCOUNT', opts), ' ', rows ? printNode(rows, opts) : '0', ';'];
}

// ---------------------------------------------------------------------------
// PRINT / RETURN
// ---------------------------------------------------------------------------

function printPrint(node: SqlNode, opts: Options): Doc {
    const expr = prop(node, 'expr');
    return [keyword('PRINT', opts), ' ', expr ? printNode(expr, opts) : '', ';'];
}

function printReturn(node: SqlNode, opts: Options): Doc {
    const expr = prop(node, 'expr');
    return expr
        ? [keyword('RETURN', opts), ' ', printNode(expr, opts), ';']
        : [keyword('RETURN', opts), ';'];
}

// ---------------------------------------------------------------------------
// IF / WHILE
// ---------------------------------------------------------------------------

function printIf(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const then = prop(node, 'then');
    const els = prop(node, 'else');

    const condDoc = condition ? printBool(condition, opts) : '';
    const thenDoc = then ? printStatementBlock(then, opts) : ';';
    const parts: Doc[] = [keyword('IF', opts), ' ', condDoc, thenDoc];

    if (els) {
        parts.push(hardline, keyword('ELSE', opts), printStatementBlock(els, opts));
    }

    return group(parts);
}

function printWhile(node: SqlNode, opts: Options): Doc {
    const condition = prop(node, 'condition');
    const body = prop(node, 'body');
    const condDoc = condition ? printBool(condition, opts) : '';
    return group([keyword('WHILE', opts), ' ', condDoc, body ? printStatementBlock(body, opts) : ';']);
}

/** Wrap a statement in BEGIN/END if it's already a block, otherwise indent inline. */
function printStatementBlock(node: SqlNode, opts: Options): Doc {
    if (node.type === 'BeginEndBlock') {
        const stmts = propArr(node, 'statements');
        return [
            hardline, keyword('BEGIN', opts),
            indent([hardline, join([hardline, hardline], stmts.map((s) => printStatementWithComments(s, opts)))]),
            hardline, keyword('END', opts),
        ];
    }
    return indent([hardline, printStatementWithComments(node, opts)]);
}

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

function printExecute(node: SqlNode, opts: Options): Doc {
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
        keyword('EXECUTE', opts), ' ', schemaObjectName(procNode),
        parameters.length > 0
            ? indent([hardline, join([',', hardline], paramDocs)])
            : '',
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / CREATE OR ALTER VIEW
// ---------------------------------------------------------------------------

function printCreateView(node: SqlNode, opts: Options): Doc {
    const columns = node.props?.['columns'] as string[] | undefined;
    const withOptions = node.props?.['withOptions'] as string[] | undefined;
    const body = prop(node, 'body'); // QueryExpression node

    const kw = node.type === 'CreateOrAlterViewStatement' ? keyword('CREATE OR ALTER VIEW', opts)
             : node.type === 'AlterViewStatement'         ? keyword('ALTER VIEW', opts)
             :                                              keyword('CREATE VIEW', opts);

    const colsPart: Doc = columns?.length
        ? [' (', join(', ', columns), ')']
        : '';

    const withPart: Doc = withOptions?.length
        ? [hardline, keyword('WITH', opts), ' ', join(', ', withOptions.map(o => keyword(o, opts)))]
        : '';

    const preBodyPart: Doc = node.preBodyComments?.length
        ? node.preBodyComments.flatMap((c): Doc[] => [hardline, c])
        : '';

    return group([
        kw, ' ', schemaObjectName(prop(node, 'name')),
        colsPart,
        withPart,
        preBodyPart,
        hardline,
        keyword('AS', opts),
        hardline,
        body ? printQueryExpression(body, opts, (n) => printNode(n, opts)) : '',
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE FUNCTION
// ---------------------------------------------------------------------------

export function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const bodyType = propStr(node, 'bodyType') ?? 'scalar';
    const returnType = propStr(node, 'returnType') ?? '';
    const body = node.props?.['body'];

    const paramDocs = parameters.map((p) => {
        const pName = propStr(p, 'name') ?? '@p';
        const dt = propStr(p, 'dataType') ?? 'INT';
        return [pName, ' ', keyword(dt, opts)] as Doc;
    });

    let bodyDoc: Doc;
    if (bodyType === 'table' || bodyType === 'inline-table') {
        bodyDoc = body && typeof body === 'object'
            ? qexpr(body as SqlNode, opts)
            : '/* table body */';
    } else {
        const stmts = Array.isArray(body) ? (body as SqlNode[]).map((s) => printStatementWithComments(s, opts)) : [];
        bodyDoc = join([hardline, hardline], stmts);
    }

    const preBody: Doc = node.preBodyComments?.length
        ? (node.preBodyComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';
    const postParam: Doc = node.postParamComments?.length
        ? (node.postParamComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';

    const fnKw =
        node.type === 'CreateOrAlterFunctionStatement' ? keyword('CREATE OR ALTER FUNCTION', opts) :
        node.type === 'AlterFunctionStatement'         ? keyword('ALTER FUNCTION', opts) :
                                                         keyword('CREATE FUNCTION', opts);

    return group([
        fnKw, ' ', schemaObjectName(prop(node, 'name')),
        preBody,
        '(',
        parameters.length > 0
            ? [indent([softline, join([',', line], paramDocs)]), softline]
            : '',
        ')',
        postParam,
        hardline,
        keyword('RETURNS', opts), ' ', keyword(returnType, opts),
        hardline,
        keyword('AS', opts),
        hardline,
        keyword('BEGIN', opts),
        indent([hardline, bodyDoc]),
        hardline,
        keyword('END', opts),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// USE / SET variants / WAITFOR
// ---------------------------------------------------------------------------

function printUse(node: SqlNode, opts: Options): Doc {
    return [keyword('USE', opts), ' ', propStr(node, 'database') ?? '', ';'];
}

function printPredicateSet(node: SqlNode, opts: Options): Doc {
    const opt   = propStr(node, 'options') ?? '';
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

function printSetStatistics(node: SqlNode, opts: Options): Doc {
    const opt   = propStr(node, 'options') ?? '';
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET STATISTICS', opts), ' ', keyword(opt, opts), ' ', onOff, ';'];
}

function printSetIdentityInsert(node: SqlNode, opts: Options): Doc {
    const onOff = propBool(node, 'isOn') ? keyword('ON', opts) : keyword('OFF', opts);
    return [keyword('SET IDENTITY_INSERT', opts), ' ', schemaObjectName(prop(node, 'table')), ' ', onOff, ';'];
}

function printSetIsolationLevel(node: SqlNode, opts: Options): Doc {
    const levelMap: Record<string, string> = {
        ReadCommitted:   'READ COMMITTED',
        ReadUncommitted: 'READ UNCOMMITTED',
        RepeatableRead:  'REPEATABLE READ',
        Serializable:    'SERIALIZABLE',
        Snapshot:        'SNAPSHOT',
    };
    const raw   = propStr(node, 'level') ?? '';
    const level = levelMap[raw] ?? raw.toUpperCase();
    return [keyword('SET TRANSACTION ISOLATION LEVEL', opts), ' ', keyword(level, opts), ';'];
}

function printWaitFor(node: SqlNode, opts: Options): Doc {
    const opt   = propStr(node, 'option') ?? 'Delay';
    const param = propStr(node, 'parameter') ?? '';
    const kw    = opt === 'Time' ? keyword('WAITFOR TIME', opts) : keyword('WAITFOR DELAY', opts);
    return [kw, ' ', param, ';'];
}

// ---------------------------------------------------------------------------
// TRUNCATE TABLE
// ---------------------------------------------------------------------------

function printTruncateTable(node: SqlNode, opts: Options): Doc {
    return [keyword('TRUNCATE TABLE', opts), ' ', schemaObjectName(prop(node, 'name')), ';'];
}

// ---------------------------------------------------------------------------
// GOTO / LABEL
// ---------------------------------------------------------------------------

function printGoto(node: SqlNode, opts: Options): Doc {
    return [keyword('GOTO', opts), ' ', propStr(node, 'label') ?? '', ';'];
}

function printLabel(node: SqlNode, opts: Options): Doc {
    // LabelStatement.Value already includes the trailing colon from ScriptDom
    return propStr(node, 'label') ?? '';
}

// ---------------------------------------------------------------------------
// THROW / RAISERROR
// ---------------------------------------------------------------------------

function printThrow(node: SqlNode, opts: Options): Doc {
    const errNum = prop(node, 'errorNumber');
    if (!errNum) return [keyword('THROW', opts), ';'];
    return [
        keyword('THROW', opts), ' ',
        printNode(errNum, opts), ', ',
        printNode(prop(node, 'message')!, opts), ', ',
        printNode(prop(node, 'state')!, opts), ';',
    ];
}

function printRaiseError(node: SqlNode, opts: Options): Doc {
    return [
        keyword('RAISERROR', opts), ' (',
        printNode(prop(node, 'message')!, opts), ', ',
        printNode(prop(node, 'severity')!, opts), ', ',
        printNode(prop(node, 'state')!, opts),
        ');',
    ];
}

// ---------------------------------------------------------------------------
// TRY / CATCH
// ---------------------------------------------------------------------------

function printTryCatch(node: SqlNode, opts: Options): Doc {
    const tryStmts  = propArr(node, 'tryBody').map(s => printStatementWithComments(s, opts));
    const catchStmts = propArr(node, 'catchBody').map(s => printStatementWithComments(s, opts));
    return [
        keyword('BEGIN TRY', opts),
        indent([hardline, join([hardline, hardline], tryStmts)]),
        hardline, keyword('END TRY', opts),
        hardline, keyword('BEGIN CATCH', opts),
        indent([hardline, join([hardline, hardline], catchStmts)]),
        hardline, keyword('END CATCH', opts),
    ];
}

// ---------------------------------------------------------------------------
// DROP TABLE / PROCEDURE / VIEW / FUNCTION
// ---------------------------------------------------------------------------

function printDropObjects(objType: string, node: SqlNode, opts: Options): Doc {
    const names = propArr(node, 'names');
    const ifExists = propBool(node, 'ifExists');
    const ifExistsPart: Doc = ifExists ? [' ', keyword('IF EXISTS', opts)] : '';
    return [
        keyword('DROP', opts), ' ', keyword(objType, opts),
        ifExistsPart, ' ',
        join(', ', names.map(n => schemaObjectName(n))),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// DROP INDEX
// ---------------------------------------------------------------------------

function printDropIndex(node: SqlNode, opts: Options): Doc {
    const indices = propArr(node, 'indices');
    const indexDocs = indices.map(idx => [
        propStr(idx, 'name') ?? '', ' ',
        keyword('ON', opts), ' ', schemaObjectName(prop(idx, 'table')),
    ] as Doc);
    return group([
        keyword('DROP INDEX', opts), ' ',
        join([',', hardline], indexDocs),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER TRIGGER
// ---------------------------------------------------------------------------

function printCreateTrigger(node: SqlNode, opts: Options): Doc {
    const kw = node.type === 'AlterTriggerStatement'
        ? keyword('ALTER TRIGGER', opts)
        : keyword('CREATE TRIGGER', opts);
    const triggerType = propStr(node, 'triggerType') ?? 'After';
    const typeMap: Record<string, string> = {
        For: 'FOR',
        After: 'AFTER',
        InsteadOf: 'INSTEAD OF',
    };
    const typeKw = keyword(typeMap[triggerType] ?? triggerType.toUpperCase(), opts);
    const actions = node.props?.['actions'];
    const actionList: Doc = Array.isArray(actions)
        ? join(', ', (actions as string[]).map(a => keyword(a.toUpperCase(), opts)))
        : '';
    const body = propArr(node, 'body');
    const bodyDocs = body.map(s => printStatementWithComments(s, opts));
    return [
        kw, ' ', schemaObjectName(prop(node, 'name')),
        hardline, keyword('ON', opts), ' ', schemaObjectName(prop(node, 'onName')),
        hardline, typeKw, ' ', actionList,
        hardline, keyword('AS', opts),
        hardline, keyword('BEGIN', opts),
        indent([hardline, join([hardline, hardline], bodyDocs)]),
        hardline, keyword('END', opts), ';',
    ];
}

// ---------------------------------------------------------------------------
// ALTER INDEX
// ---------------------------------------------------------------------------

function printAlterIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName');
    const table = prop(node, 'table');
    const alterType = propStr(node, 'alterType') ?? 'Rebuild';
    const typeKwMap: Record<string, string> = {
        Rebuild: 'REBUILD',
        Reorganize: 'REORGANIZE',
        Disable: 'DISABLE',
        Set: 'SET',
    };
    const typeKw = keyword(typeKwMap[alterType] ?? alterType.toUpperCase(), opts);
    return [
        keyword('ALTER INDEX', opts), ' ',
        indexName ? indexName : keyword('ALL', opts),
        ' ', keyword('ON', opts), ' ', schemaObjectName(table),
        hardline, typeKw, ';',
    ];
}

// ---------------------------------------------------------------------------
// Cursor operations
// ---------------------------------------------------------------------------

function printDeclareCursor(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? 'cursor_name';
    const options = node.props?.['options'];
    const optPart: Doc = Array.isArray(options) && options.length > 0
        ? [(options as string[]).join(' '), ' ']
        : [];
    const select = prop(node, 'select');
    return group([
        keyword('DECLARE', opts), ' ', name, ' ', ...optPart,
        keyword('CURSOR', opts),
        hardline, keyword('FOR', opts),
        hardline, select ? qexpr(select, opts) : '',
        ';',
    ]);
}

function printOpenCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('OPEN', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

function printFetchCursor(node: SqlNode, opts: Options): Doc {
    const fetchType = propStr(node, 'fetchType') ?? 'Next';
    const cursorName = propStr(node, 'cursorName') ?? '';
    const intoVars = node.props?.['intoVariables'];
    const fetchOffset = prop(node, 'fetchOffset');

    const typeMap: Record<string, string> = {
        Next: 'NEXT', Prior: 'PRIOR', First: 'FIRST', Last: 'LAST',
        Absolute: 'ABSOLUTE', Relative: 'RELATIVE',
    };
    const typeKw = keyword(typeMap[fetchType] ?? fetchType.toUpperCase(), opts);
    const offsetPart: Doc = fetchOffset ? [' ', printNode(fetchOffset, opts)] : '';
    const intoPart: Doc = Array.isArray(intoVars) && intoVars.length > 0
        ? [' ', keyword('INTO', opts), ' ', join(', ', intoVars as string[])]
        : '';

    return [
        keyword('FETCH', opts), ' ', typeKw, offsetPart, ' ',
        keyword('FROM', opts), ' ', cursorName,
        intoPart, ';',
    ];
}

function printCloseCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('CLOSE', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

function printDeallocateCursor(node: SqlNode, opts: Options): Doc {
    return [keyword('DEALLOCATE', opts), ' ', propStr(node, 'cursorName') ?? '', ';'];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER SEQUENCE
// ---------------------------------------------------------------------------

function printSequenceOptions(node: SqlNode, opts: Options, isAlter: boolean): Doc[] {
    const parts: Doc[] = [];
    const dataType = propStr(node, 'dataType');
    if (dataType) parts.push(hardline, keyword('AS', opts), ' ', keyword(dataType, opts));
    const startWith = propStr(node, 'startWith');
    if (startWith != null) parts.push(hardline, keyword('START WITH', opts), ' ', startWith);
    const restartWith = propStr(node, 'restartWith');
    if (restartWith != null) parts.push(hardline, keyword('RESTART WITH', opts), ' ', restartWith);
    const incrementBy = propStr(node, 'incrementBy');
    if (incrementBy != null) parts.push(hardline, keyword('INCREMENT BY', opts), ' ', incrementBy);
    const minValue = propStr(node, 'minValue');
    const noMinValue = node.props?.['noMinValue'];
    if (minValue != null) parts.push(hardline, keyword('MINVALUE', opts), ' ', minValue);
    else if (noMinValue) parts.push(hardline, keyword('NO MINVALUE', opts));
    const maxValue = propStr(node, 'maxValue');
    const noMaxValue = node.props?.['noMaxValue'];
    if (maxValue != null) parts.push(hardline, keyword('MAXVALUE', opts), ' ', maxValue);
    else if (noMaxValue) parts.push(hardline, keyword('NO MAXVALUE', opts));
    const cycle = node.props?.['cycle'];
    if (cycle === true) parts.push(hardline, keyword('CYCLE', opts));
    else if (cycle === false) parts.push(hardline, keyword('NO CYCLE', opts));
    const cache = propStr(node, 'cache');
    const noCache = node.props?.['noCache'];
    if (cache != null) parts.push(hardline, keyword('CACHE', opts), ' ', cache);
    else if (noCache) parts.push(hardline, keyword('NO CACHE', opts));
    return parts;
}

function printCreateSequence(node: SqlNode, opts: Options): Doc {
    return group([
        keyword('CREATE SEQUENCE', opts), ' ', schemaObjectName(prop(node, 'name')),
        ...printSequenceOptions(node, opts, false),
        ';',
    ]);
}

function printAlterSequence(node: SqlNode, opts: Options): Doc {
    return group([
        keyword('ALTER SEQUENCE', opts), ' ', schemaObjectName(prop(node, 'name')),
        ...printSequenceOptions(node, opts, true),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// BULK INSERT
// ---------------------------------------------------------------------------

function printBulkInsert(node: SqlNode, opts: Options): Doc {
    const table = prop(node, 'table');
    const from = propStr(node, 'from');
    const options = node.props?.['options'];
    const optDocs: Doc = Array.isArray(options) && options.length > 0
        ? [
            hardline, keyword('WITH', opts), ' (',
            indent([hardline, join([',', hardline], (options as string[]))]),
            hardline, ')',
          ]
        : '';
    return group([
        keyword('BULK INSERT', opts), ' ', schemaObjectName(table),
        hardline, keyword('FROM', opts), ' ', from ?? '',
        optDocs,
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE TYPE
// ---------------------------------------------------------------------------

function printCreateTypeUddt(node: SqlNode, opts: Options): Doc {
    const nullable = node.props?.['nullable'];
    const nullablePart: Doc = nullable === false ? [' ', keyword('NOT NULL', opts)]
                            : nullable === true  ? [' ', keyword('NULL', opts)]
                            : '';
    return [
        keyword('CREATE TYPE', opts), ' ', schemaObjectName(prop(node, 'name')),
        ' ', keyword('FROM', opts), ' ',
        keyword(propStr(node, 'dataType') ?? '', opts),
        nullablePart, ';',
    ];
}

function printCreateTypeTable(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const allDefs = [
        ...columns.map(c => printColumnDef(c, opts)),
        ...constraints.map(c => printConstraintDef(c, opts)),
    ];
    return group([
        keyword('CREATE TYPE', opts), ' ', schemaObjectName(prop(node, 'name')),
        ' ', keyword('AS TABLE', opts), ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline, ');',
    ]);
}

// ---------------------------------------------------------------------------
// OUTPUT clause (shared by INSERT / UPDATE / DELETE / MERGE)
// ---------------------------------------------------------------------------

function printOutputColumns(columns: SqlNode[], opts: Options): Doc {
    return join([',', line], columns.map(c => printNode(c, opts)));
}

function printOutputClause(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    return group([
        keyword('OUTPUT', opts),
        indent([line, printOutputColumns(columns, opts)]),
    ]);
}

function printOutputIntoClause(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const into = prop(node, 'into');
    const intoColumns = propArr(node, 'intoColumns');

    const intoColsPart: Doc = intoColumns.length
        ? [' (', join(', ', intoColumns.map(c => printNode(c, opts))), ')']
        : '';

    return group([
        keyword('OUTPUT', opts),
        indent([line, printOutputColumns(columns, opts)]),
        hardline,
        keyword('INTO', opts), ' ', into ? printTable(into, opts) : '',
        intoColsPart,
    ]);
}

// ---------------------------------------------------------------------------
// MERGE
// ---------------------------------------------------------------------------

function printMerge(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const target = prop(node, 'target');
    const targetAlias = propStr(node, 'targetAlias');
    const source = prop(node, 'source');
    const on = prop(node, 'on');
    const clauses = propArr(node, 'clauses');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const targetDoc: Doc = target
        ? (targetAlias ? [printTable(target, opts), ' ', keyword('AS', opts), ' ', targetAlias] : printTable(target, opts))
        : '';

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('MERGE INTO', opts), ' ', targetDoc,
        hardline,
        keyword('USING', opts), ' ', source ? printTable(source, opts) : '',
        hardline,
        keyword('ON', opts), ' ', on ? printBool(on, opts) : '',
    ];

    for (const clause of clauses) {
        parts.push(hardline, printMergeClause(clause, opts));
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    parts.push(';');
    return group(parts);
}

function printMergeClause(node: SqlNode, opts: Options): Doc {
    const condition = propStr(node, 'condition') ?? 'Matched';
    const predicate = prop(node, 'predicate');
    const action    = prop(node, 'action');

    const condKw: Doc =
        condition === 'Matched'            ? keyword('WHEN MATCHED', opts) :
        condition === 'NotMatchedByTarget' ? keyword('WHEN NOT MATCHED BY TARGET', opts) :
        condition === 'NotMatched'         ? keyword('WHEN NOT MATCHED', opts) :
                                             keyword('WHEN NOT MATCHED BY SOURCE', opts);

    const predPart: Doc = predicate
        ? [' ', keyword('AND', opts), ' ', printBool(predicate, opts)]
        : '';

    return [
        condKw, predPart,
        ' ', keyword('THEN', opts),
        indent([hardline, action ? printMergeAction(action, opts) : '']),
    ];
}

function printMergeAction(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'MergeUpdateAction': {
            const setParts = propArr(node, 'set').map(sc => {
                const col   = prop(sc, 'column');
                const val   = prop(sc, 'value');
                const opStr = assignmentOp(propStr(sc, 'operator') ?? 'Equals');
                return [col ? printNode(col, opts) : '', ' ', opStr, ' ', val ? printNode(val, opts) : ''] as Doc;
            });
            return [
                keyword('UPDATE SET', opts),
                indent([hardline, join([',', hardline], setParts)]),
            ];
        }
        case 'MergeInsertAction': {
            const columns = propArr(node, 'columns');
            const source  = prop(node, 'source');
            const colsPart: Doc = columns.length
                ? ['(', join(', ', columns.map(c => printNode(c, opts))), ')']
                : '';
            return [keyword('INSERT', opts), ' ', colsPart, source ? printMergeValues(source, opts) : ''];
        }
        case 'MergeDeleteAction':
            return keyword('DELETE', opts);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function printMergeValues(source: SqlNode, opts: Options): Doc {
    if (source.type !== 'ValuesSource') return source.text ? [hardline, source.text] : '';
    const rows = source.props?.['rows'];
    if (!Array.isArray(rows) || rows.length === 0) return [hardline, keyword('VALUES', opts), ' ()'];
    // MERGE INSERT has exactly one VALUES row
    const row = rows[0] as SqlNode;
    const vals = propArr(row, 'values').map(v => printNode(v, opts));
    return [hardline, keyword('VALUES', opts), ' (', join(', ', vals), ')'];
}
