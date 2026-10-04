import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import {
    keyword,
    getDensity,
    getCommaStyle,
    hardSep,
    softSep,
    hardline,
    join,
    indent,
    group,
    line,
    softline,
    lineSuffix,
    appendTrailingLines,
    parenList,
    optionItems,
    hasLineSuffix,
} from '@prettier-sql/core/printer/utils';
import { valuesRow, valuesDoc, setClauseDoc, joinStatements } from '@prettier-sql/core/printer/layout';
import { prop, propArr, propStr, propBool, assignmentOp, claimTrailingComment, takeTrailingComment, unprintedComments, withTrailingComment, takeLeadingComments } from './helpers.js';
import {
    printExpression,
    printBoolExpr,
    printTableRef,
    optimizerHintDoc,
    printOrderByClause,
    printQueryExpression,
    boolWithTrailing,
    boolEndsWithPendingComment,
    printTop,
    rightmostPred,
} from './expressions.js';
import {
    printCreateTable,
    printAlterTable,
    printCreateIndex,
    printCreateVectorIndex,
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
    printCreatePartitionFunction,
    printAlterPartitionFunction,
    printDropPartitionFunction,
    printCreatePartitionScheme,
    printAlterPartitionScheme,
    printDropPartitionScheme,
    printEnableDisableTrigger,
    printCreateColumnStoreIndex,
    printCreateStatistics,
    printUpdateStatistics,
    printDropStatistics,
    printCreateColumnMasterKey,
    printCreateColumnEncryptionKey,
    printAlterColumnEncryptionKey,
    printDropColumnMasterKey,
    printDropColumnEncryptionKey,
    printCreateExternalModel,
    printAlterExternalModel,
    printDropExternalModel,
    printAtomicOptions,
} from './ddl.js';
import {
    printBeginTransaction,
    printCommitTransaction,
    printRollbackTransaction,
    printSaveTransaction,
    printCheckpoint,
    printKill,
    printReconfigure,
    printDeclareVariable,
    printDeclareTableVariable,
    printSetVariable,
    printReceive,
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
    printExecuteAsStatement,
    printRevert,
} from './procedural.js';
import {
    printGrantDenyRevoke,
    printAlterAuthorization,
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
    printAlterEventSession,
} from './admin.js';

// ---------------------------------------------------------------------------
// Shared helpers — exported for use in ddl.ts, procedural.ts, and admin.ts
// (those files import printStatementWithComments from here; circular but safe in ESM)
// ---------------------------------------------------------------------------

/** Print a node via the expression dispatcher (no path needed for inner nodes). */
export function printNode(node: SqlNode, opts: Options): Doc {
    return printExpression(node, opts, (n) => printNode(n, opts));
}

/**
 * Print a boolean expression node via the expression dispatcher, including any
 * trailing comment on its rightmost predicate leaf — printBoolExpr's own
 * claimPredicateComments() claims that comment (so a BooleanBinary's own parts don't
 * print it too) on every call, even for a single, non-binary predicate that has no
 * enclosing printer to take and print it back. Without this, such a comment (e.g. on
 * a WHILE or IF condition) was claimed and then never printed inline — it only
 * resurfaced via the statement-level unprintedComments fallback, at the very end.
 */
export function printBool(node: SqlNode, opts: Options): Doc {
    return boolWithTrailing(node, printBoolExpr(node, opts, (n) => printNode(n, opts)));
}

/** Print a query expression node via the expression dispatcher. */
export function qexpr(node: SqlNode, opts: Options): Doc {
    return printQueryExpression(node, opts, (n) => printNode(n, opts));
}

/** True when the doc ends with a line comment that no hard line has flushed yet. */
function endsInPendingLineComment(doc: Doc): boolean {
    let pending = false;
    const walk = (d: Doc): void => {
        if (Array.isArray(d)) return d.forEach(walk);
        if (!d || typeof d !== 'object') return;
        const o = d as { type?: string; hard?: boolean; contents?: Doc; parts?: Doc[]; breakContents?: Doc; flatContents?: Doc };
        if (o.type === 'line-suffix') pending = true;
        else if (o.type === 'line' && o.hard) pending = false;
        else if (o.type === 'if-break') walk(o.breakContents ?? '');
        else if (o.parts) o.parts.forEach(walk);
        else if (o.contents !== undefined) walk(o.contents);
    };
    walk(doc);
    return pending;
}

/**
 * Append a trailing comment to a doc.
 * Line comments (--) stay on the same line via lineSuffix.
 * Block comments go on their own line(s) after the doc.
 */
function appendTrailingComment(doc: Doc, comment: string | undefined): Doc {
    if (!comment) return doc;
    // A comment that stood on a line of its own after the statement (a leading newline marks it)
    if (comment.startsWith('\n')) return appendTrailingLines(doc, comment.slice(1));
    // A line comment already waiting for the end of the line would swallow this one
    if (comment.startsWith('--') && endsInPendingLineComment(doc)) return appendTrailingLines(doc, comment);
    if (comment.startsWith('--')) {
        // Several comments are joined by newlines: the first stays on the line, each other gets its own
        const [first, ...rest] = comment.split(/\r?\n/);
        const withFirst: Doc = [doc, lineSuffix([' ', first!])];
        return rest.length > 0 ? appendTrailingLines(withFirst, rest.join('\n')) : withFirst;
    }
    return appendTrailingLines(doc, comment);
}

/**
 * Print a statement with its leading and trailing comments.
 * Used for top-level statements and for bodies in procs/functions/triggers/IF/WHILE/etc.
 * Exported so that ddl.ts and procedural.ts can call it (circular import — safe in ESM).
 */
export function printStatementWithComments(s: SqlNode, opts: Options): Doc {
    const printed = printStatement(s, opts);
    // Comments inside the statement that no part of it printed: keep them, after it
    const leftover = unprintedComments(s);
    const stmtDoc = leftover.length > 0 ? appendTrailingLines(printed, leftover.join('\n')) : printed;
    // Taken (marked printed), so an enclosing statement's leftover check doesn't print it again
    // after leftover comments (printed on their own lines) it goes on a line of its own as well
    const trailing = takeTrailingComment(s);
    const withTrailing = leftover.length > 0 && trailing ? appendTrailingLines(stmtDoc, trailing.replace(/^\n/, '')) : appendTrailingComment(stmtDoc, trailing);
    const leading = takeLeadingComments(s);
    if (leading.length) {
        return [...leading.flatMap((c): Doc[] => [c, hardline]), withTrailing] as Doc;
    }
    return withTrailing;
}

// Append any trailing comment on the rightmost predicate leaf — covers single-predicate
// WHERE with a comment below it, and comments after the last predicate in a multi-predicate WHERE.
function printBoolDoc(where: SqlNode, opts: Options): Doc {
    const leaf = rightmostPred(where);
    if (leaf?.trailingComment) claimTrailingComment(leaf);
    const base = printBool(where, opts);
    return appendTrailingLines(base, takeTrailingComment(leaf));
}

function printTable(node: SqlNode, opts: Options): Doc {
    return printTableRef(node, opts, (n) => printNode(n, opts));
}

/**
 * Print a clause keyword followed by a boolean expression.
 * Single-predicate stays inline (` WHERE x = 1`); multi-predicate breaks to
 * an indented block. In spacious mode all predicates are always indented.
 */
export function printBoolClause(kw: string, where: SqlNode, opts: Options): Doc {
    const density = getDensity(opts);
    const inline = density !== 'spacious' && where.type !== 'BooleanBinary';
    const body = printBoolDoc(where, opts);
    return [keyword(kw, opts), inline ? [' ', body] : indent([hardline, body])];
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
    // Nothing but comments (and GO lines): kept as written
    const commentsOnly = node.props?.['commentsOnly'] as string | undefined;
    if (batches.length === 0 && commentsOnly) return [commentsOnly, hardline];
    if (batches.length === 0) return '';

    const go = keyword('go', opts);
    const goLine = (count: number | null): Doc => (count === null ? go : [go, ' ', String(count)]);
    const parts: Doc[] = [];
    // GO 5 before the first batch runs nothing, but it stays
    for (const count of (node.props?.['goBefore'] as (number | null)[] | undefined) ?? []) {
        if (count !== null) parts.push(goLine(count), hardline, hardline);
    }
    for (let i = 0; i < batches.length; i++) {
        if (i > 0) parts.push(hardline, hardline);
        parts.push(printBatch(batches[i]!, opts));
        const stmts = propArr(batches[i]!, 'statements');
        // The GO lines after this batch, when one has a repeat count; a bare GO after the first is a no-op
        const goLines = batches[i]!.props?.['goLines'] as (number | null)[] | undefined;
        if (goLines) {
            goLines.forEach((count, k) => {
                if (k === 0 || count !== null) parts.push(hardline, goLine(count));
            });
            continue;
        }
        const needsGo = batches.length > 1 || stmts.some((s) => BATCH_ISOLATING.has(s.type));
        if (needsGo) parts.push(hardline, go);
    }
    // End the file with a newline, as Prettier's own printers and the pgsql plugin do;
    // otherwise `prettier --write` strips the final newline editors add.
    parts.push(hardline);
    return parts;
}

/**
 * "Minor" statements are short bookkeeping lines — DECLARE, SET, RETURN,
 * RAISERROR, etc. — that shouldn't force a blank line between them.
 * "Major" statements (SELECT/INSERT/UPDATE/DELETE/MERGE, IF/WHILE/TRY blocks,
 * EXEC, transactions, DDL, …) do get a blank line before them.
 *
 * Rule: blank line between two statements unless BOTH are minor.
 */
const MINOR_STATEMENT_TYPES = new Set([
    // declarations
    'DeclareVariableStatement',
    'DeclareTableVariableStatement',
    'DeclareCursorStatement',
    // SET variants
    'SetVariableStatement',
    'PredicateSetStatement',
    'SetRowCountStatement',
    'SetIdentityInsertStatement',
    'SetTransactionIsolationLevelStatement',
    'SetStatisticsStatement',
    // flow helpers
    'ReturnStatement',
    'RaiseErrorStatement',
    'ThrowStatement',
    'PrintStatement',
    'BreakStatement',
    'ContinueStatement',
    'GotoStatement',
    'LabelStatement',
    // transactions
    'BeginTransactionStatement',
    'CommitTransactionStatement',
    'RollbackTransactionStatement',
    'SaveTransactionStatement',
    // context / admin
    'UseStatement',
    'CheckpointStatement',
    // security
    'GrantStatement',
    'DenyStatement',
    'RevokeStatement',
    // cursor lifecycle
    'OpenCursorStatement',
    'CloseCursorStatement',
    'FetchCursorStatement',
    'DeallocateCursorStatement',
]);

export function isMinor(node: SqlNode): boolean {
    if (MINOR_STATEMENT_TYPES.has(node.type)) return true;
    // A bare-body IF (no ELSE, no BEGIN/END body) inherits minor/major from its body.
    // e.g. `IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;` is minor because ROLLBACK is minor.
    if (node.type === 'IfStatement') {
        const then = node.props?.['then'] as SqlNode | undefined;
        const els  = node.props?.['else'];
        if (!els && then && then.type !== 'BeginEndBlock') return isMinor(then);
    }
    return false;
}

/**
 * Join a list of statement nodes with blank lines between them, except that
 * consecutive "minor" statements (DECLARE, SET, RETURN, …) are grouped
 * without a blank line. Used for procedure/function/trigger bodies and
 * top-level batches.
 */
export function joinBodyStatements(stmts: SqlNode[], opts: Options): Doc {
    return joinStatements(stmts, isMinor, (s) => printStatementWithComments(s, opts));
}

function printBatch(node: SqlNode, opts: Options): Doc {
    const stmts = propArr(node, 'statements');
    return joinBodyStatements(stmts, opts);
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
        case 'CreateVectorIndexStatement':
            return printCreateVectorIndex(node, opts);
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
        case 'EnableDisableTriggerStatement':
            return printEnableDisableTrigger(node, opts);

        // DDL — columnstore index
        case 'CreateColumnStoreIndexStatement':
            return printCreateColumnStoreIndex(node, opts);

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

        // Always Encrypted — column master keys & column encryption keys
        case 'CreateColumnMasterKeyStatement':
            return printCreateColumnMasterKey(node, opts);
        case 'CreateColumnEncryptionKeyStatement':
            return printCreateColumnEncryptionKey(node, opts);
        case 'AlterColumnEncryptionKeyStatement':
            return printAlterColumnEncryptionKey(node, opts);
        case 'DropColumnMasterKeyStatement':
            return printDropColumnMasterKey(node, opts);
        case 'DropColumnEncryptionKeyStatement':
            return printDropColumnEncryptionKey(node, opts);

        // CREATE/ALTER/DROP EXTERNAL MODEL (SQL Server 2025 AI functions)
        case 'CreateExternalModelStatement':
            return printCreateExternalModel(node, opts);
        case 'AlterExternalModelStatement':
            return printAlterExternalModel(node, opts);
        case 'DropExternalModelStatement':
            return printDropExternalModel(node, opts);

        // DDL — partition functions & schemes
        case 'CreatePartitionFunctionStatement':
            return printCreatePartitionFunction(node, opts);
        case 'AlterPartitionFunctionStatement':
            return printAlterPartitionFunction(node, opts);
        case 'DropPartitionFunctionStatement':
            return printDropPartitionFunction(node, opts);
        case 'CreatePartitionSchemeStatement':
            return printCreatePartitionScheme(node, opts);
        case 'AlterPartitionSchemeStatement':
            return printAlterPartitionScheme(node, opts);
        case 'DropPartitionSchemeStatement':
            return printDropPartitionScheme(node, opts);

        // BEGIN/END block (proc bodies, inline blocks)
        case 'BeginEndBlock': {
            const stmts = propArr(node, 'statements');
            return [
                keyword('BEGIN', opts),
                indent([hardline, joinBodyStatements(stmts, opts)]),
                hardline,
                keyword('END', opts),
            ];
        }

        case 'BeginEndAtomicBlock': {
            const atomicOptions = propArr(node, 'atomicOptions');
            const stmts = propArr(node, 'statements');
            const bodyDocs = stmts.map((s) => printStatementWithComments(s, opts));
            return [
                keyword('BEGIN', opts),
                ' ',
                keyword('ATOMIC', opts),
                ' ',
                keyword('WITH', opts),
                ' (',
                indent([hardline, join([',', hardline], printAtomicOptions(atomicOptions, opts))]),
                hardline,
                ')',
                indent([hardline, join([hardline, hardline], bodyDocs)]),
                hardline,
                keyword('END', opts),
            ];
        }

        // Transactions
        case 'BeginTransactionStatement':
            return printBeginTransaction(node, opts);
        case 'CommitTransactionStatement':
            return printCommitTransaction(node, opts);
        case 'RollbackTransactionStatement':
            return printRollbackTransaction(node, opts);
        case 'SaveTransactionStatement':
            return printSaveTransaction(node, opts);

        // Variable management
        case 'DeclareVariableStatement':
            return printDeclareVariable(node, opts);
        case 'DeclareTableVariableStatement':
            return printDeclareTableVariable(node, opts);
        case 'SetVariableStatement':
            return printSetVariable(node, opts);
        case 'SetRowCountStatement':
            return printSetRowCount(node, opts);

        // Operational
        case 'CheckpointStatement':
            return printCheckpoint(node, opts);
        case 'KillStatement':
            return printKill(node, opts);
        case 'ReconfigureStatement':
            return printReconfigure(node, opts);

        // DDL — statistics
        case 'CreateStatisticsStatement':
            return printCreateStatistics(node, opts);
        case 'UpdateStatisticsStatement':
            return printUpdateStatistics(node, opts);
        case 'DropStatisticsStatement':
            return printDropStatistics(node, opts);

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
        case 'ReceiveStatement':
            return printReceive(node, opts);

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

        // Session context
        case 'ExecuteAsStatement':
            return printExecuteAsStatement(node, opts);
        case 'RevertStatement':
            return printRevert(node, opts);

        // Security — GRANT / DENY / REVOKE / ALTER AUTHORIZATION
        case 'GrantStatement':
            return printGrantDenyRevoke(node, 'GRANT', opts);
        case 'DenyStatement':
            return printGrantDenyRevoke(node, 'DENY', opts);
        case 'RevokeStatement':
            return printGrantDenyRevoke(node, 'REVOKE', opts);
        case 'AlterAuthorizationStatement':
            return printAlterAuthorization(node, opts);

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

        // ── Extended Events ───────────────────────────────────────────────────
        case 'AlterEventSessionStatement':
            return printAlterEventSession(node, opts);

        // ── Service Broker ────────────────────────────────────────────────────
        case 'EndConversationStatement': {
            const handle = propStr(node, 'handle') ?? '';
            const withCleanup = propBool(node, 'withCleanup');
            const errorCode = propStr(node, 'errorCode');
            const errorDesc = propStr(node, 'errorDescription');
            let withPart: Doc = '';
            if (withCleanup) {
                withPart = [' ', keyword('WITH CLEANUP', opts)];
            } else if (errorCode) {
                // the error and its description each on their own line when the statement doesn't fit
                withPart = indent([
                    line, keyword('WITH ERROR =', opts), ' ', errorCode,
                    line, keyword('DESCRIPTION =', opts), ' ', errorDesc ?? "''",
                ]);
            }
            return [group([keyword('END CONVERSATION', opts), ' ', handle, withPart]), ';'];
        }

        default: {
            // Raw-text fallback for statement types not yet explicitly handled.
            // ScriptDOM includes the trailing ';' terminator in the fragment when the
            // source already has one; strip it so we can add exactly one semicolon.
            const raw = node.text ?? `/* unhandled statement: ${node.type} */`;
            const clean = raw.replace(/;\s*$/, '');
            return [clean, ';'];
        }
    }
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

export function printCtes(node: SqlNode, opts: Options): Doc[] {
    const ctes = propArr(node, 'ctes');
    const xmlNamespaces = node.props?.['xmlNamespaces'] as string[] | undefined;
    const changeTrackingCtx = propStr(node, 'changeTrackingContext');

    // WITH CHANGE_TRACKING_CONTEXT emits as a separate statement prefix
    const ctxPrefix: Doc[] = changeTrackingCtx
        ? [[keyword('WITH CHANGE_TRACKING_CONTEXT', opts), ' (', changeTrackingCtx, ')'], hardline]
        : [];

    if (ctes.length === 0 && !xmlNamespaces?.length) return ctxPrefix;

    const leading = getCommaStyle(opts) === 'leading';
    const sep: Doc = leading ? [hardline, ', '] : [',', hardline];

    // Collect all items for the WITH clause: XMLNAMESPACES first, then CTEs.
    const allItems: Doc[] = [];

    if (xmlNamespaces?.length) {
        allItems.push([
            keyword('XMLNAMESPACES', opts),
            ' (',
            indent([hardline, join(sep, xmlNamespaces)]),
            hardline,
            ')',
        ]);
    }

    for (const cte of ctes) {
        const name = propStr(cte, 'name') ?? 'cte';
        const cols = cte.props?.['columns'] as string[] | undefined;
        const query = prop(cte, 'query');
        const colsPart: Doc = cols?.length ? [' ', parenList(cols)] : '';
        const queryComments: Doc[] = takeLeadingComments(cte).flatMap((c): Doc[] => [c, hardline]);
        allItems.push(
            withTrailingComment(cte, [
                name,
                colsPart,
                ' ',
                keyword('AS', opts),
                ' (',
                indent([hardline, ...queryComments, query ? qexpr(query, opts) : '']),
                hardline,
                ')',
            ] as Doc),
        );
    }

    return [...ctxPrefix, [keyword('WITH', opts), indent([hardline, join(sep, allItems)])], hardline];
}

function printSelect(node: SqlNode, opts: Options): Doc {
    return [printSelectBody(node, opts), ';'];
}

/** A SELECT statement without its terminating semicolon (also the body of CREATE TABLE ... AS). */
export function printSelectBody(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const queryExpr = prop(node, 'queryExpression');
    const orderBy = prop(node, 'orderBy');
    const parts: Doc[] = [...ctesDocs, queryExpr ? qexpr(queryExpr, opts) : ''];

    if (orderBy) {
        parts.push(
            hardline,
            printOrderByClause(orderBy, opts, (n) => printNode(n, opts)),
        );
    }
    parts.push(optionClause(node, opts));
    return group(parts);
}

/** OPTION (RECOMPILE, MAXDOP 1, ...): query hints, which any SELECT or DML statement can end with. */
function optionClause(node: SqlNode, opts: Options): Doc {
    const hints = (node.props?.['optimizerHints'] as string[] | undefined) ?? [];
    return hints.length > 0 ? [hardline, keyword('OPTION', opts), ' ', optionItems(hints.map((h) => optimizerHintDoc(h, opts)), opts)] : '';
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
        ? group([
              ' (',
              indent([
                  softline,
                  join(
                      softSep(opts),
                      columns.map((c) => printNode(c, opts)),
                  ),
              ]),
              softline,
              ')',
          ])
        : '';

    const sourcePart: Doc =
        source?.type === 'ValuesSource'
            ? printValuesSource(source, opts)
            : source?.type === 'DefaultValuesSource'
              ? [hardline, keyword('DEFAULT VALUES', opts)]
              : source
                ? [hardline, qexpr(source, opts)]
                : '';

    const topNode = prop(node, 'top');
    const parts: Doc[] = [
        ...ctesDocs,
        topNode ? [keyword('INSERT', opts), ' ', renderTopFilter(topNode, opts), ' ', keyword('INTO', opts)] : keyword('INSERT INTO', opts),
        ' ',
        target ? printTable(target, opts) : '',
        colsPart,
    ];

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    parts.push(sourcePart, optionClause(node, opts), ';');
    return group(parts);
}

function printValuesSource(node: SqlNode, opts: Options): Doc {
    const rows = node.props?.['rows'];
    if (!Array.isArray(rows)) return [hardline, keyword('VALUES', opts), ' ()'];

    const rowDocs = rows.map((row) => {
        const rowNode = row as SqlNode;
        const rowDoc = valuesRow(propArr(rowNode, 'values').map((v) => printNode(v, opts)), opts);
        const rowComment = takeTrailingComment(rowNode);
        return rowComment ? [rowDoc, lineSuffix([' ', rowComment])] : rowDoc;
    });

    return [hardline, valuesDoc(rowDocs, propArr(rows[0] as SqlNode, 'values').length, opts)];
}

// ---------------------------------------------------------------------------
// Shared SET-clause renderer (UPDATE and MERGE UPDATE)
// ---------------------------------------------------------------------------

/** TOP (n) [PERCENT] [WITH TIES] of an INSERT, UPDATE, DELETE or MERGE. */
function renderTopFilter(topNode: SqlNode, opts: Options): Doc {
    return printTop(topNode, opts, (n) => printNode(n, opts));
}

/**
 * Render one SET clause item, handling three forms:
 *   col = val             — plain column assignment
 *   @var = val            — variable-only assignment (no column update)
 *   col = @var = val      — compound: update col AND assign @var
 */
function printSetClauseItem(sc: SqlNode, opts: Options): Doc {
    const col = prop(sc, 'column');
    const val = prop(sc, 'value');
    const variable = propStr(sc, 'variable');
    const opStr = assignmentOp(propStr(sc, 'operator') ?? 'Equals');
    let lhs: Doc;
    // SET @v = col = expr: the variable comes first (`col = @v = expr` doesn't parse)
    if (col && variable) lhs = [variable, ' = ', printNode(col, opts)];
    else if (col) lhs = printNode(col, opts);
    else if (variable) lhs = variable;
    // Any other set clause (e.g. col.WRITE(...)) is kept verbatim: it has no `= value`
    else return sc.text ?? '';
    return [lhs, ' ', opStr, ' ', val ? printNode(val, opts) : ''] as Doc;
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function printUpdate(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const topNode = prop(node, 'top');
    const target = prop(node, 'target');
    const setClauses = propArr(node, 'set');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const setParts = setClauses.map((sc) => printSetClauseItem(sc, opts));
    const topDoc: Doc = topNode ? [' ', renderTopFilter(topNode, opts)] : '';

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('UPDATE', opts),
        topDoc,
        ' ',
        target ? printTable(target, opts) : '',
        hardline,
        setClauseDoc(setParts, opts),
    ];

    // OUTPUT comes before FROM in UPDATE (and multi-table DELETE)
    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        parts.push(
            hardline,
            keyword('FROM', opts),
            indent([
                hardline,
                join(
                    hardSep(opts),
                    tableRefs.map((tr) => printTable(tr, opts)),
                ),
            ]),
        );
    }

    if (where) parts.push(hardline, printBoolClause('WHERE', where, opts));

    parts.push(optionClause(node, opts), ';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

function printDelete(node: SqlNode, opts: Options): Doc {
    const ctesDocs = printCtes(node, opts);
    const topNode = prop(node, 'top');
    const target = prop(node, 'target');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const output = prop(node, 'output');
    const outputInto = prop(node, 'outputInto');

    const topDoc: Doc = topNode ? [' ', renderTopFilter(topNode, opts)] : '';
    // Multi-table DELETE: DELETE [TOP] alias FROM join-tree
    // Simple DELETE: DELETE [TOP] FROM table (TOP goes between DELETE and FROM)
    let parts: Doc[];
    if (from) {
        parts = [...ctesDocs, keyword('DELETE', opts), topDoc, ' ', target ? printTable(target, opts) : ''];
    } else {
        parts = [...ctesDocs, keyword('DELETE', opts), topDoc, ' ', keyword('FROM', opts), ' ', target ? printTable(target, opts) : ''];
    }

    // OUTPUT follows the target and comes before any FROM
    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        parts.push(
            hardline,
            keyword('FROM', opts),
            indent([
                hardline,
                join(
                    hardSep(opts),
                    tableRefs.map((tr) => printTable(tr, opts)),
                ),
            ]),
        );
    }

    if (where) parts.push(hardline, printBoolClause('WHERE', where, opts));

    parts.push(optionClause(node, opts), ';');
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
              ' ',
              group([
                  '(',
                  indent([
                      softline,
                      join(
                          [',', line],
                          intoColumns.map((c) => printNode(c, opts)),
                      ),
                  ]),
                  softline,
                  ')',
              ]),
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
    const topNode = prop(node, 'top');
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

    const topDoc: Doc = topNode ? [renderTopFilter(topNode, opts), ' '] : '';
    const sourceDoc: Doc = source ? printTable(source, opts) : '';
    // A trailing `--` comment on the source (e.g. `USING s -- src`) queues as a
    // lineSuffix that only flushes at the next hardline — without one here it would
    // flush past `ON ...`, landing on the wrong line. Force a break so it lands right
    // after the source, in place of the usual space before `ON`.
    const sourceSep: Doc = hasLineSuffix(sourceDoc) ? hardline : ' ';

    const density = getDensity(opts);
    let onDoc: Doc = '';
    if (on) {
        const isMultiple = on.type === 'BooleanBinary';
        if (density === 'compact') {
            onDoc = [sourceSep, keyword('ON', opts), ' ', printBool(on, opts)];
        } else if (density === 'standard' && !isMultiple) {
            onDoc = [sourceSep, keyword('ON', opts), group([indent([line, printBool(on, opts)])])];
        } else {
            onDoc = [sourceSep, keyword('ON', opts), indent([hardline, printBool(on, opts)])];
        }
    }

    const parts: Doc[] = [
        ...ctesDocs,
        keyword('MERGE', opts),
        ' ',
        topDoc,
        keyword('INTO', opts),
        ' ',
        targetDoc,
        hardline,
        keyword('USING', opts),
        ' ',
        sourceDoc,
        onDoc,
    ];

    for (const clause of clauses) {
        parts.push(hardline, printMergeClause(clause, opts));
    }

    if (outputInto) parts.push(hardline, printOutputIntoClause(outputInto, opts));
    else if (output) parts.push(hardline, printOutputClause(output, opts));

    parts.push(optionClause(node, opts), ';');
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

    // A trailing comment on the predicate prints on its own new line with nothing to
    // end it — without a break here, `THEN` would land right after it, inside the
    // comment, and the output wouldn't parse.
    const needsBreak = predicate ? boolEndsWithPendingComment(predicate) : false;
    const predDoc = predicate ? printBool(predicate, opts) : undefined;
    const predPart: Doc = predDoc ? [' ', keyword('AND', opts), ' ', predDoc] : '';
    const actionDoc = action ? printMergeAction(action, opts) : '';
    const density = getDensity(opts);
    const thenSep: Doc = needsBreak ? hardline : ' ';
    const thenAction: Doc =
        density === 'compact'
            ? [thenSep, keyword('THEN', opts), ' ', actionDoc]
            : [thenSep, keyword('THEN', opts), indent([hardline, actionDoc])];

    return [condKw, predPart, thenAction];
}

function printMergeAction(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'MergeUpdateAction': {
            const setParts = propArr(node, 'set').map((sc) => printSetClauseItem(sc, opts));
            const density = getDensity(opts);
            const setBody: Doc =
                density !== 'spacious' && setParts.length === 1
                    ? [' ', setParts[0]!]
                    : indent([hardline, join(hardSep(opts), setParts)]);
            return [keyword('UPDATE SET', opts), setBody];
        }
        case 'MergeInsertAction': {
            const columns = propArr(node, 'columns');
            const source = prop(node, 'source');
            const colsPart: Doc = columns.length
                ? group([
                      '(',
                      indent([
                          softline,
                          join(
                              [',', line],
                              columns.map((c) => printNode(c, opts)),
                          ),
                      ]),
                      softline,
                      ')',
                  ])
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
    // INSERT DEFAULT VALUES never has a column list, and the caller already spaced after INSERT
    if (source.type === 'DefaultValuesSource') return keyword('DEFAULT VALUES', opts);
    if (source.type !== 'ValuesSource') return source.text ? [hardline, source.text] : '';
    const rows = source.props?.['rows'];
    if (!Array.isArray(rows) || rows.length === 0) return [hardline, keyword('VALUES', opts), ' ()'];
    // MERGE INSERT has exactly one VALUES row
    const row = rows[0] as SqlNode;
    const vals = propArr(row, 'values').map((v) => printNode(v, opts));
    const valuesDoc: Doc = [keyword('VALUES', opts), ' (', join(', ', vals), ')'];
    const density = getDensity(opts);
    return density === 'compact' ? [' ', valuesDoc] : [hardline, valuesDoc];
}
