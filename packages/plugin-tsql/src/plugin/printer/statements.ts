import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import {
    keyword,
    getDensity,
    getCommaStyle,
    hardline,
    join,
    indent,
    group,
    line,
    softline,
    lineSuffix,
} from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName, assignmentOp } from './helpers.js';
import {
    printExpression,
    printBoolExpr,
    printTableRef,
    printOrderByClause,
    printQueryExpression,
} from './expressions.js';
import {
    printCreateTable,
    printAlterTable,
    printCreateIndex,
    printCreateProcedure,
    printCreateFunction,
    printCreateView,
    printCreateTrigger,
    printAlterIndex,
    printCreateSequence,
    printAlterSequence,
    printBulkInsert,
    printCreateTypeUddt,
    printCreateTypeTable,
    printDropObjects,
    printDropIndex,
    printCreateSynonym,
    printCreateSchema,
    printAlterSchema,
    printDropSchema,
} from './ddl.js';
import {
    printBeginTransaction,
    printCommitTransaction,
    printRollbackTransaction,
    printDeclareVariable,
    printDeclareTableVariable,
    printSetVariable,
    printSetRowCount,
    printUse,
    printPredicateSet,
    printSetStatistics,
    printSetIdentityInsert,
    printSetIsolationLevel,
    printWaitFor,
    printPrint,
    printReturn,
    printIf,
    printWhile,
    printExecute,
    printTruncateTable,
    printGoto,
    printLabel,
    printThrow,
    printRaiseError,
    printTryCatch,
    printDeclareCursor,
    printOpenCursor,
    printFetchCursor,
    printCloseCursor,
    printDeallocateCursor,
} from './procedural.js';
import {
    printGrantDenyRevoke,
    printCreateUser,
    printAlterUser,
    printDropUser,
    printCreateLogin,
    printAlterLogin,
    printDropLogin,
    printCreateRole,
    printAlterRole,
    printDropRole,
} from './security.js';
import {
    printDropDatabase,
    printDbcc,
    printBackupDatabase,
    printBackupLog,
    printRestore,
    printCreateDatabase,
    printAlterDatabaseSet,
    printAlterDatabaseCollate,
    printAlterDatabaseModifyName,
    printAlterDatabaseScopedConfigSet,
    printAlterDatabaseScopedConfigClear,
    printAlterDatabaseAddFile,
    printAlterDatabaseAddFileGroup,
    printAlterDatabaseRemoveFile,
    printAlterDatabaseRemoveFileGroup,
    printAlterDatabaseModifyFile,
    printAlterDatabaseModifyFileGroup,
    printAlterDatabaseRebuildLog,
} from './admin.js';

// ---------------------------------------------------------------------------
// Shared helpers — used here and re-exported for ddl.ts / procedural.ts
// ---------------------------------------------------------------------------

/** Print a node via the expression dispatcher (no path needed for inner nodes). */
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
    return [doc, ...comment.split(/\r?\n/).flatMap((c): Doc[] => [hardline, c])];
}

/**
 * Print a statement with its leading and trailing comments.
 * Used for top-level statements and for bodies in procs/functions/triggers/IF/WHILE/etc.
 * Exported so that ddl.ts and procedural.ts can call it (circular import — safe in ESM).
 */
export function printStatementWithComments(s: SqlNode, opts: Options): Doc {
    const stmtDoc = printStatement(s, opts);
    const withTrailing = appendTrailingComment(stmtDoc, s.trailingComment);
    if (s.leadingComments?.length) {
        return [...s.leadingComments.flatMap((c): Doc[] => [c, hardline]), withTrailing] as Doc;
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

// Append any trailing comment on the rightmost predicate leaf — covers single-predicate
// WHERE with a comment below it, and comments after the last predicate in a multi-predicate WHERE.
function printBoolDoc(where: SqlNode, opts: Options): Doc {
    const base = printBool(where, opts);
    const trailing = rightmostBoolLeaf(where)?.trailingComment;
    if (!trailing) return base;
    return [base, ...trailing.split(/\r?\n/).flatMap((c): Doc[] => [hardline, c])];
}

function printTable(node: SqlNode, opts: Options): Doc {
    return printTableRef(node, opts, (n) => printNode(n, opts));
}

// ---------------------------------------------------------------------------
// Script / Batch
// ---------------------------------------------------------------------------

/** Statement types that must be isolated in their own batch. */
const BATCH_ISOLATING = new Set([
    'CreateViewStatement',
    'AlterViewStatement',
    'CreateOrAlterViewStatement',
    'CreateProcedureStatement',
    'CreateOrAlterProcedureStatement',
    'AlterProcedureStatement',
    'CreateFunctionStatement',
    'AlterFunctionStatement',
    'CreateOrAlterFunctionStatement',
    'CreateTriggerStatement',
    'AlterTriggerStatement',
]);

export function printScript(node: SqlNode, opts: Options): Doc {
    const batches = propArr(node, 'batches');
    if (batches.length === 0) return '';

    const go = keyword('go', opts);
    const parts: Doc[] = [];
    for (let i = 0; i < batches.length; i++) {
        if (i > 0) parts.push(hardline, hardline);
        parts.push(printBatch(batches[i]!, opts));
        const stmts = propArr(batches[i]!, 'statements');
        const needsGo = batches.length > 1 || stmts.some((s) => BATCH_ISOLATING.has(s.type));
        if (needsGo) parts.push(hardline, go);
    }
    return parts;
}

function printBatch(node: SqlNode, opts: Options): Doc {
    const stmts = propArr(node, 'statements');
    if (stmts.length === 0) return '';
    return join(
        [hardline, hardline],
        stmts.map((s) => printStatementWithComments(s, opts)),
    );
}

// ---------------------------------------------------------------------------
// Statement dispatcher
// ---------------------------------------------------------------------------

export function printStatement(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        // DML
        case 'SelectStatement':
            return printSelect(node, opts);
        case 'InsertStatement':
            return printInsert(node, opts);
        case 'UpdateStatement':
            return printUpdate(node, opts);
        case 'DeleteStatement':
            return printDelete(node, opts);
        case 'MergeStatement':
            return printMerge(node, opts);

        // DDL — tables & indexes
        case 'CreateTableStatement':
            return printCreateTable(node, opts);
        case 'AlterTableStatement':
            return printAlterTable(node, opts);
        case 'CreateIndexStatement':
            return printCreateIndex(node, opts);
        case 'AlterIndexStatement':
            return printAlterIndex(node, opts);
        case 'DropIndexStatement':
            return printDropIndex(node, opts);

        // DDL — procedures & functions
        case 'CreateProcedureStatement':
        case 'AlterProcedureStatement':
        case 'CreateOrAlterProcedureStatement':
            return printCreateProcedure(node, opts);
        case 'CreateFunctionStatement':
        case 'AlterFunctionStatement':
        case 'CreateOrAlterFunctionStatement':
            return printCreateFunction(node, opts);

        // DDL — views
        case 'CreateViewStatement':
        case 'AlterViewStatement':
        case 'CreateOrAlterViewStatement':
            return printCreateView(node, opts);

        // DDL — triggers
        case 'CreateTriggerStatement':
        case 'AlterTriggerStatement':
            return printCreateTrigger(node, opts);

        // DDL — sequences
        case 'CreateSequenceStatement':
            return printCreateSequence(node, opts);
        case 'AlterSequenceStatement':
            return printAlterSequence(node, opts);

        // DDL — types & bulk insert
        case 'BulkInsertStatement':
            return printBulkInsert(node, opts);
        case 'CreateTypeUddtStatement':
            return printCreateTypeUddt(node, opts);
        case 'CreateTypeTableStatement':
            return printCreateTypeTable(node, opts);

        // DDL — DROP (shared helper)
        case 'DropTableStatement':
            return printDropObjects('TABLE', node, opts);
        case 'DropProcedureStatement':
            return printDropObjects('PROCEDURE', node, opts);
        case 'DropViewStatement':
            return printDropObjects('VIEW', node, opts);
        case 'DropFunctionStatement':
            return printDropObjects('FUNCTION', node, opts);
        case 'DropTriggerStatement':
            return printDropObjects('TRIGGER', node, opts);
        case 'DropSequenceStatement':
            return printDropObjects('SEQUENCE', node, opts);
        case 'DropSynonymStatement':
            return printDropObjects('SYNONYM', node, opts);

        // DDL — synonyms
        case 'CreateSynonymStatement':
            return printCreateSynonym(node, opts);

        // DDL — schemas
        case 'CreateSchemaStatement':
            return printCreateSchema(node, opts);
        case 'AlterSchemaStatement':
            return printAlterSchema(node, opts);
        case 'DropSchemaStatement':
            return printDropSchema(node, opts);

        // BEGIN/END block (proc bodies, inline blocks)
        case 'BeginEndBlock': {
            const stmts = propArr(node, 'statements');
            return join(
                [hardline, hardline],
                stmts.map((s) => printStatementWithComments(s, opts)),
            );
        }

        // Transactions
        case 'BeginTransactionStatement':
            return printBeginTransaction(node, opts);
        case 'CommitTransactionStatement':
            return printCommitTransaction(node, opts);
        case 'RollbackTransactionStatement':
            return printRollbackTransaction(node, opts);

        // Variable management
        case 'DeclareVariableStatement':
            return printDeclareVariable(node, opts);
        case 'DeclareTableVariableStatement':
            return printDeclareTableVariable(node, opts);
        case 'SetVariableStatement':
            return printSetVariable(node, opts);
        case 'SetRowCountStatement':
            return printSetRowCount(node, opts);

        // SET / USE / WAITFOR
        case 'UseStatement':
            return printUse(node, opts);
        case 'PredicateSetStatement':
            return printPredicateSet(node, opts);
        case 'SetStatisticsStatement':
            return printSetStatistics(node, opts);
        case 'SetIdentityInsertStatement':
            return printSetIdentityInsert(node, opts);
        case 'SetTransactionIsolationLevelStatement':
            return printSetIsolationLevel(node, opts);
        case 'WaitForStatement':
            return printWaitFor(node, opts);

        // Output / flow
        case 'PrintStatement':
            return printPrint(node, opts);
        case 'ReturnStatement':
            return printReturn(node, opts);
        case 'IfStatement':
            return printIf(node, opts);
        case 'WhileStatement':
            return printWhile(node, opts);
        case 'ExecuteStatement':
            return printExecute(node, opts);
        case 'TruncateTableStatement':
            return printTruncateTable(node, opts);
        case 'BreakStatement':
            return [keyword('BREAK', opts), ';'];
        case 'ContinueStatement':
            return [keyword('CONTINUE', opts), ';'];
        case 'GotoStatement':
            return printGoto(node, opts);
        case 'LabelStatement':
            return printLabel(node, opts);
        case 'ThrowStatement':
            return printThrow(node, opts);
        case 'RaiseErrorStatement':
            return printRaiseError(node, opts);
        case 'TryCatchStatement':
            return printTryCatch(node, opts);

        // Cursors
        case 'DeclareCursorStatement':
            return printDeclareCursor(node, opts);
        case 'OpenCursorStatement':
            return printOpenCursor(node, opts);
        case 'FetchCursorStatement':
            return printFetchCursor(node, opts);
        case 'CloseCursorStatement':
            return printCloseCursor(node, opts);
        case 'DeallocateCursorStatement':
            return printDeallocateCursor(node, opts);

        // Security — GRANT / DENY / REVOKE
        case 'GrantStatement':
            return printGrantDenyRevoke(node, 'GRANT', opts);
        case 'DenyStatement':
            return printGrantDenyRevoke(node, 'DENY', opts);
        case 'RevokeStatement':
            return printGrantDenyRevoke(node, 'REVOKE', opts);

        // Security — USER / LOGIN / ROLE
        case 'CreateUserStatement':
            return printCreateUser(node, opts);
        case 'AlterUserStatement':
            return printAlterUser(node, opts);
        case 'DropUserStatement':
            return printDropUser(node, opts);
        case 'CreateLoginStatement':
            return printCreateLogin(node, opts);
        case 'AlterLoginStatement':
            return printAlterLogin(node, opts);
        case 'DropLoginStatement':
            return printDropLogin(node, opts);
        case 'CreateRoleStatement':
            return printCreateRole(node, opts);
        case 'AlterRoleStatement':
            return printAlterRole(node, opts);
        case 'DropRoleStatement':
            return printDropRole(node, opts);

        // Database admin — DROP DATABASE, DBCC, BACKUP, RESTORE, CREATE DATABASE
        case 'DropDatabaseStatement':
            return printDropDatabase(node, opts);
        case 'DbccStatement':
            return printDbcc(node, opts);
        case 'BackupDatabaseStatement':
            return printBackupDatabase(node, opts);
        case 'BackupTransactionLogStatement':
            return printBackupLog(node, opts);
        case 'RestoreStatement':
            return printRestore(node, opts);
        case 'CreateDatabaseStatement':
            return printCreateDatabase(node, opts);

        // ALTER DATABASE variants
        case 'AlterDatabaseSetStatement':
            return printAlterDatabaseSet(node, opts);
        case 'AlterDatabaseCollateStatement':
            return printAlterDatabaseCollate(node, opts);
        case 'AlterDatabaseModifyNameStatement':
            return printAlterDatabaseModifyName(node, opts);
        case 'AlterDatabaseScopedConfigurationSetStatement':
            return printAlterDatabaseScopedConfigSet(node, opts);
        case 'AlterDatabaseScopedConfigurationClearStatement':
            return printAlterDatabaseScopedConfigClear(node, opts);
        case 'AlterDatabaseAddFileStatement':
            return printAlterDatabaseAddFile(node, opts);
        case 'AlterDatabaseAddFileGroupStatement':
            return printAlterDatabaseAddFileGroup(node, opts);
        case 'AlterDatabaseRemoveFileStatement':
            return printAlterDatabaseRemoveFile(node, opts);
        case 'AlterDatabaseRemoveFileGroupStatement':
            return printAlterDatabaseRemoveFileGroup(node, opts);
        case 'AlterDatabaseModifyFileStatement':
            return printAlterDatabaseModifyFile(node, opts);
        case 'AlterDatabaseModifyFileGroupStatement':
            return printAlterDatabaseModifyFileGroup(node, opts);
        case 'AlterDatabaseRebuildLogStatement':
            return printAlterDatabaseRebuildLog(node, opts);

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

    const leading = getCommaStyle(opts) === 'leading';
    const cteDocs = ctes.map((cte, i) => {
        const name = propStr(cte, 'name') ?? 'cte';
        const cols = cte.props?.['columns'] as string[] | undefined;
        const query = prop(cte, 'query');

        const colsPart: Doc = cols?.length ? [' (', join(', ', cols), ')'] : '';

        // trailing: align subsequent CTEs under "with " with 4 spaces
        // leading:  no prefix — the separator provides ", " before the CTE name
        return [
            i === 0 ? keyword('WITH', opts) + ' ' : leading ? '' : '    ',
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

    const sep: Doc = leading ? [hardline, ', '] : [',', hardline];
    return [join(sep, cteDocs), hardline];
}

function printSelect(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const queryExpr = prop(node, 'queryExpression');
    const orderBy = prop(node, 'orderBy');
    const optimizerHints = node.props?.['optimizerHints'] as string[] | undefined;

    const parts: Doc[] = [...ctesDocs, queryExpr ? qexpr(queryExpr, opts) : ''];

    if (orderBy) {
        parts.push(
            hardline,
            printOrderByClause(orderBy, opts, (n) => printNode(n, opts)),
        );
    }
    if (optimizerHints?.length) {
        parts.push(
            hardline,
            keyword('OPTION', opts),
            ' (',
            join(
                ', ',
                optimizerHints.map((h) => keyword(h, opts)),
            ),
            ')',
        );
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

function printInsert(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const target = prop(node, 'target');
    const columns = propArr(node, 'columns');
    const source = prop(node, 'source');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const colsPart: Doc = columns.length
        ? [
              ' (',
              indent([
                  softline,
                  join(
                      [',', line],
                      columns.map((c) => printNode(c, opts)),
                  ),
              ]),
              softline,
              ')',
          ]
        : '';

    const sourcePart: Doc =
        source?.type === 'ValuesSource'
            ? printValuesSource(source, opts)
            : source
              ? [hardline, qexpr(source, opts)]
              : '';

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('INSERT INTO', opts),
        ' ',
        target ? printTable(target, opts) : '',
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
        return rowNode.trailingComment ? [rowDoc, lineSuffix([' ', rowNode.trailingComment])] : rowDoc;
    });

    return [hardline, keyword('VALUES', opts), indent([hardline, join([',', hardline], rowDocs)])];
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function printUpdate(node: SqlNode, opts: Options): Doc {
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
            indent([
                hardline,
                join(
                    [',', hardline],
                    tableRefs.map((tr) => printTable(tr, opts)),
                ),
            ]),
        );
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (where) {
        const inline = density !== 'spacious' && where.type !== 'BooleanBinary';
        parts.push(
            hardline,
            keyword('WHERE', opts),
            inline ? [' ', printBoolDoc(where, opts)] : indent([hardline, printBoolDoc(where, opts)]),
        );
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

function printDelete(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const density = getDensity(opts);
    const target = prop(node, 'target');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const parts: Doc[] = [...ctesDocs, keyword('DELETE FROM', opts), ' ', target ? printTable(target, opts) : ''];

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        parts.push(
            hardline,
            keyword('FROM', opts),
            indent([
                hardline,
                join(
                    [',', hardline],
                    tableRefs.map((tr) => printTable(tr, opts)),
                ),
            ]),
        );
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (where) {
        const inline = density !== 'spacious' && where.type !== 'BooleanBinary';
        parts.push(
            hardline,
            keyword('WHERE', opts),
            inline ? [' ', printBoolDoc(where, opts)] : indent([hardline, printBoolDoc(where, opts)]),
        );
    }

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// OUTPUT clause (shared by INSERT / UPDATE / DELETE / MERGE)
// ---------------------------------------------------------------------------

function printOutputColumns(columns: SqlNode[], opts: Options): Doc {
    return join(
        [',', line],
        columns.map((c) => printNode(c, opts)),
    );
}

function printOutputClause(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    return group([keyword('OUTPUT', opts), indent([line, printOutputColumns(columns, opts)])]);
}

function printOutputIntoClause(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const into = prop(node, 'into');
    const intoColumns = propArr(node, 'intoColumns');

    const intoColsPart: Doc = intoColumns.length
        ? [
              ' (',
              join(
                  ', ',
                  intoColumns.map((c) => printNode(c, opts)),
              ),
              ')',
          ]
        : '';

    return group([
        keyword('OUTPUT', opts),
        indent([line, printOutputColumns(columns, opts)]),
        hardline,
        keyword('INTO', opts),
        ' ',
        into ? printTable(into, opts) : '',
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
        ? targetAlias
            ? [printTable(target, opts), ' ', keyword('AS', opts), ' ', targetAlias]
            : printTable(target, opts)
        : '';

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('MERGE INTO', opts),
        ' ',
        targetDoc,
        hardline,
        keyword('USING', opts),
        ' ',
        source ? printTable(source, opts) : '',
        hardline,
        keyword('ON', opts),
        ' ',
        on ? printBool(on, opts) : '',
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
    const action = prop(node, 'action');

    const condKw: Doc =
        condition === 'Matched'
            ? keyword('WHEN MATCHED', opts)
            : condition === 'NotMatchedByTarget'
              ? keyword('WHEN NOT MATCHED BY TARGET', opts)
              : condition === 'NotMatched'
                ? keyword('WHEN NOT MATCHED', opts)
                : keyword('WHEN NOT MATCHED BY SOURCE', opts);

    const predPart: Doc = predicate ? [' ', keyword('AND', opts), ' ', printBool(predicate, opts)] : '';

    return [
        condKw,
        predPart,
        ' ',
        keyword('THEN', opts),
        indent([hardline, action ? printMergeAction(action, opts) : '']),
    ];
}

function printMergeAction(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'MergeUpdateAction': {
            const setParts = propArr(node, 'set').map((sc) => {
                const col = prop(sc, 'column');
                const val = prop(sc, 'value');
                const opStr = assignmentOp(propStr(sc, 'operator') ?? 'Equals');
                return [col ? printNode(col, opts) : '', ' ', opStr, ' ', val ? printNode(val, opts) : ''] as Doc;
            });
            return [keyword('UPDATE SET', opts), indent([hardline, join([',', hardline], setParts)])];
        }
        case 'MergeInsertAction': {
            const columns = propArr(node, 'columns');
            const source = prop(node, 'source');
            const colsPart: Doc = columns.length
                ? [
                      '(',
                      join(
                          ', ',
                          columns.map((c) => printNode(c, opts)),
                      ),
                      ')',
                  ]
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
    const vals = propArr(row, 'values').map((v) => printNode(v, opts));
    return [hardline, keyword('VALUES', opts), ' (', join(', ', vals), ')'];
}
