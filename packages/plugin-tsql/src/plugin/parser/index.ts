import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SqlNode, CommentToken } from './types.js';

// ---------------------------------------------------------------------------
// DLL loading
// ---------------------------------------------------------------------------

interface DotnetModule {
    load(dllPath: string): void;
    PrettierTsql: {
        SqlParser: { Parse(sql: string): string };
    };
}

// node-api-dotnet is a native CommonJS module; use createRequire for ESM compat.
let dotnetModule: DotnetModule | null = null;

function loadDotnet(): DotnetModule {
    if (dotnetModule) return dotnetModule;

    const require = createRequire(import.meta.url);
    const dotnet = require('node-api-dotnet') as DotnetModule;

    // Resolve DLL path relative to this file's location:
    //   compiled:  dist/parser/index.js  → ../../bin/dotnet
    //   source:    src/plugin/parser/index.ts → ../../../bin/dotnet
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const isCompiled = thisDir.endsWith(path.join('dist', 'parser'))
        || thisDir.endsWith('dist/parser');
    const dllPath = isCompiled
        ? path.resolve(thisDir, '../../bin/dotnet/SqlScriptDom.dll')
        : path.resolve(thisDir, '../../../bin/dotnet/SqlScriptDom.dll');

    // Only cache the module after a successful load.
    dotnet.load(dllPath);
    dotnetModule = dotnet;
    return dotnetModule;
}

// ---------------------------------------------------------------------------
// Public parse entry point
// ---------------------------------------------------------------------------

export function parse(text: string): SqlNode {
    const { SqlParser } = loadDotnet().PrettierTsql;
    const result = JSON.parse(SqlParser.Parse(text)) as {
        ast?: SqlNode;
        comments?: CommentToken[];
        errors?: Array<{ message: string; line: number; column: number }>;
    };

    if (result.errors?.length) {
        const e = result.errors[0]!;
        throw new SyntaxError(`T-SQL parse error at ${e.line}:${e.column}: ${e.message}`);
    }

    if (!result.ast) {
        throw new Error('Parser returned no AST and no errors');
    }

    if (result.comments?.length) {
        attachComments(result.ast, result.comments, text);
    }

    return result.ast;
}

// ---------------------------------------------------------------------------
// Comment attachment
//
// Comments from ScriptDom are separate from the AST.  We attach them to AST
// nodes in three passes so the printer can emit them in the right position.
//
//   Pass 1 — Trailing same-line comments (-- style):
//     Find line comments on the same source line as a statement or INSERT row
//     and store them as node.trailingComment.
//
//   Pass 2 — Leading / pre-body comments:
//     For each remaining comment, find the first statement that starts after
//     the comment ends and store it as node.leadingComments[].
//     Comments that fall physically *inside* a statement's span are routed to
//     node.preBodyComments[] (before the body) or node.postParamComments[]
//     (after the last parameter but before AS/BEGIN).
//     Comments after the last statement in the file attach to the last
//     statement's trailingComment so they are never silently dropped.
//
//   Pass 3 — Intra-statement comments (commented-out predicates, etc.):
//     Any comment still inside a statement's span is attached to the nearest
//     surrounding AST descendant — preferring the forward neighbour as a
//     leadingComment when that neighbour is a statement node, otherwise the
//     backward neighbour as a trailingComment.
// ---------------------------------------------------------------------------

function attachComments(ast: SqlNode, comments: CommentToken[], text: string): void {
    const used = new Set<CommentToken>();
    const batches = (ast.props?.['batches'] ?? []) as SqlNode[];
    const allStatements = batches.flatMap(b => (b.props?.['statements'] ?? []) as SqlNode[]);

    attachSameLineTrailing(batches, comments, text, used);
    attachLeadingAndPreBody(allStatements, comments, used);
    attachIntraStatement(batches, comments, used);
}

// Pass 1: trailing line comments on the same source line as a statement.
function attachSameLineTrailing(
    batches: SqlNode[],
    comments: CommentToken[],
    text: string,
    used: Set<CommentToken>,
): void {
    for (const batch of batches) {
        const statements = (batch.props?.['statements'] ?? []) as SqlNode[];
        for (const stmt of statements) {
            // For INSERT … VALUES, also check each row for its own trailing comment.
            if (stmt.type === 'InsertStatement') {
                const source = stmt.props?.['source'] as SqlNode | null;
                if (source?.type === 'ValuesSource') {
                    for (const row of (source.props?.['rows'] ?? []) as SqlNode[]) {
                        const c = findTrailingLineComment(row, comments, text, used);
                        if (c) { row.trailingComment = c.text; used.add(c); }
                    }
                }
            }
            const c = findTrailingLineComment(stmt, comments, text, used);
            if (c) { stmt.trailingComment = c.text; used.add(c); }
        }
    }
}

// Pass 2: leading comments (standalone lines before a statement) and
// pre-body comments (inside a statement but before its body start).
function attachLeadingAndPreBody(
    allStatements: SqlNode[],
    comments: CommentToken[],
    used: Set<CommentToken>,
): void {
    const unusedSorted = comments
        .filter(c => !used.has(c))
        .sort((a, b) => a.startOffset - b.startOffset);

    for (const c of unusedSorted) {
        // Check whether the comment is physically inside a statement's span.
        const container = allStatements.find(
            s => c.startOffset > s.startOffset && c.endOffset <= s.endOffset,
        );

        if (container) {
            // The comment is inside a statement. Route it to preBodyComments or
            // postParamComments if it falls before the body start boundary.
            //
            // bodyStart (added by AstBuilder) = StatementList.StartOffset, which
            // ScriptDom sets to the BEGIN keyword — the boundary between
            // "header / params" and "body".  For CREATE VIEW we fall back to
            // the body node's own startOffset.
            const bodyStartProp = container.props?.['bodyStart'];
            const bodyProp = container.props?.['body'];
            const bodyNode = !Array.isArray(bodyProp) && bodyProp != null
                && typeof bodyProp === 'object' && 'startOffset' in (bodyProp as object)
                ? bodyProp as SqlNode
                : undefined;
            const beforePoint = typeof bodyStartProp === 'number'
                ? bodyStartProp
                : bodyNode?.startOffset;

            if (beforePoint !== undefined && c.endOffset <= beforePoint) {
                // Distinguish "before parameter list" from "after last parameter".
                const paramsProp = container.props?.['parameters'];
                const params = Array.isArray(paramsProp) ? paramsProp as SqlNode[] : [];
                const lastParam = params.at(-1);
                if (lastParam && c.startOffset > lastParam.endOffset) {
                    // e.g. /*WITH ENCRYPTION*/ after params but before AS
                    container.postParamComments = container.postParamComments ?? [];
                    container.postParamComments.push(c.text);
                } else {
                    // Banner / descriptive comment before the param list
                    container.preBodyComments = container.preBodyComments ?? [];
                    container.preBodyComments.push(c.text);
                }
                used.add(c);
            }
            // Do not re-attach this comment as a leading comment elsewhere.
            continue;
        }

        // Not inside any statement — attach to the first statement that starts
        // after this comment.
        const target = allStatements.find(s => s.startOffset >= c.endOffset);
        if (target) {
            target.leadingComments = target.leadingComments ?? [];
            target.leadingComments.push(c.text);
            used.add(c);
        } else {
            // Comment appears after all statements (end of file).
            // Attach to the last statement so it is never silently dropped.
            const last = allStatements.at(-1);
            if (last) {
                last.trailingComment = last.trailingComment
                    ? last.trailingComment + '\n' + c.text
                    : c.text;
                used.add(c);
            }
        }
    }
}

// Pass 3: intra-statement comments (e.g. commented-out WHERE predicates).
function attachIntraStatement(
    batches: SqlNode[],
    comments: CommentToken[],
    used: Set<CommentToken>,
): void {
    for (const batch of batches) {
        const statements = (batch.props?.['statements'] ?? []) as SqlNode[];
        for (const stmt of statements) {
            const internal = comments.filter(
                c => !used.has(c)
                    && c.startOffset >= stmt.startOffset
                    && c.endOffset <= stmt.endOffset,
            ).sort((a, b) => a.startOffset - b.startOffset);
            if (internal.length === 0) continue;

            const descendants: SqlNode[] = [];
            collectDescendants(stmt, descendants);

            for (const c of internal) {
                // Find the nearest backward neighbour (highest endOffset ≤ comment start)
                // and the nearest forward neighbour (lowest startOffset ≥ comment end).
                let best: SqlNode | null = null;
                let bestForward: SqlNode | null = null;
                for (const node of descendants) {
                    if (node.endOffset <= c.startOffset) {
                        if (!best || node.endOffset >= best.endOffset) best = node;
                    }
                    if (node.startOffset >= c.endOffset) {
                        if (!bestForward || node.startOffset < bestForward.startOffset) bestForward = node;
                    }
                }

                // Prefer attaching as a leading comment to the next statement node.
                // printStatementWithComments will emit it before the statement body
                // (e.g. a comment between BEGIN and the first SELECT).
                if (bestForward?.type.endsWith('Statement')) {
                    bestForward.leadingComments = bestForward.leadingComments ?? [];
                    bestForward.leadingComments.push(c.text);
                    used.add(c);
                } else if (best) {
                    best.trailingComment = best.trailingComment
                        ? best.trailingComment + '\n' + c.text
                        : c.text;
                    used.add(c);
                } else {
                    // No suitable neighbour — fall back to the containing statement.
                    stmt.leadingComments = stmt.leadingComments ?? [];
                    stmt.leadingComments.push(c.text);
                    used.add(c);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all descendant nodes into result (including node itself). */
function collectDescendants(node: SqlNode, result: SqlNode[]): void {
    result.push(node);
    const props = node.props;
    if (!props) return;
    for (const val of Object.values(props)) {
        if (!val) continue;
        if (Array.isArray(val)) {
            for (const item of val) {
                if (item && typeof item === 'object' && 'type' in item) {
                    collectDescendants(item as SqlNode, result);
                }
            }
        } else if (typeof val === 'object' && 'type' in val) {
            collectDescendants(val as SqlNode, result);
        }
    }
}

/**
 * Find a line comment (`-- ...`) that starts on the same source line as node
 * and has not already been consumed.
 */
function findTrailingLineComment(
    node: SqlNode,
    comments: CommentToken[],
    text: string,
    used: Set<CommentToken>,
): CommentToken | undefined {
    return comments.find(c =>
        c.type === 'line'
        && !used.has(c)
        && c.startOffset >= node.endOffset
        && !text.substring(node.endOffset, c.startOffset).includes('\n'),
    );
}

// ---------------------------------------------------------------------------
// Prettier loc helpers
// ---------------------------------------------------------------------------

export function locStart(node: SqlNode): number {
    return node.startOffset;
}

export function locEnd(node: SqlNode): number {
    return node.endOffset;
}
