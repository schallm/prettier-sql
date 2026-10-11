import type { SqlNode, CommentToken } from '@prettier-sql/core/types';
import { loadDotnetDll, type DotnetHandle } from '@prettier-sql/core/parser';

// ---------------------------------------------------------------------------
// DLL loading
// ---------------------------------------------------------------------------

interface PgsqlDotnet extends DotnetHandle {
    PrettierPgsql: { PgsqlParser: { Parse(sql: string): string; Canonical(sql: string): string | null; UnreadProperties(): string } };
}

let dotnetModule: PgsqlDotnet | null = null;

function loadDotnet(): PgsqlDotnet {
    if (dotnetModule) return dotnetModule;
    dotnetModule = loadDotnetDll(import.meta.url, 'PgScriptDom.dll', 'prettier-plugin-postgresql') as PgsqlDotnet;
    return dotnetModule;
}

// ---------------------------------------------------------------------------
// Public parse entry point
// ---------------------------------------------------------------------------

export function parse(text: string): SqlNode {
    const { PgsqlParser } = loadDotnet().PrettierPgsql;
    const result = JSON.parse(PgsqlParser.Parse(text)) as {
        ast?: SqlNode;
        comments?: CommentToken[];
        errors?: Array<{ kind?: 'parse' | 'unsupported'; message: string; line: number; column: number }>;
    };

    if (result.errors?.length) {
        const e = result.errors[0]!;
        throw new SyntaxError(
            e.kind === 'unsupported'
                ? `PostgreSQL formatting error: ${e.message}`
                : `PostgreSQL parse error at ${e.line}:${e.column}: ${e.message}`
        );
    }

    if (!result.ast) {
        throw new Error('Parser returned no AST and no errors');
    }

    if (result.comments?.length) {
        attachComments(result.ast, result.comments, text);
    }

    return result.ast;
}

/**
 * The SQL's meaning in canonical form — libpg_query's parse tree without source
 * positions, plus its comments — or null if it doesn't parse. Formatting must leave
 * this unchanged; the tests compare it before and after.
 */
export function canonical(text: string): string | null {
    return loadDotnet().PrettierPgsql.PgsqlParser.Canonical(text) ?? null;
}

/** The libpg_query fields the AST builder never reads, as `Type.Property`. Each one is dropped from the output. */
export function unreadProperties(): string[] {
    return loadDotnet().PrettierPgsql.PgsqlParser.UnreadProperties().split('\n').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Comment attachment
// ---------------------------------------------------------------------------

function attachComments(ast: SqlNode, comments: CommentToken[], text: string): void {
    const used = new Set<CommentToken>();
    const statements = (ast.props?.['statements'] ?? []) as SqlNode[];

    // A script of nothing but comments has no statement to hang them on
    if (statements.length === 0) {
        ast.props = { ...ast.props, comments: comments.sort((a, b) => a.startOffset - b.startOffset).map((c) => c.text) };
        return;
    }

    // Offsets are UTF-8 byte offsets, as libpg_query reports them
    const bytes = Buffer.from(text, 'utf8');
    const between = (from: number, to: number): string => bytes.subarray(from, to).toString('utf8');

    for (const c of comments.sort((a, b) => a.startOffset - b.startOffset)) {
        // A statement kept as its source text already holds the comments inside it
        if (statements.some((s) => s.type === 'UnknownStatement' && s.startOffset <= c.startOffset && c.endOffset <= s.endOffset)) continue;
        // On the line a statement ends on, after it — `insert ...; -- seed data` — it trails
        // that statement (several such comments are joined by spaces)
        const sameLine = statements.find((s) => s.endOffset <= c.startOffset && /^[ \t;]*$/.test(between(s.endOffset, c.startOffset)))
            ?? statements.find((s) => s.trailingComment && !s.trailingComment.includes('\n') && s.endOffset <= c.startOffset
                && /^[ \t;]*$/.test(between(s.endOffset, c.startOffset).replace(/\/\*[\s\S]*?\*\//g, '')));
        if (sameLine) {
            sameLine.trailingComment = sameLine.trailingComment ? sameLine.trailingComment + ' ' + c.text : c.text;
            used.add(c);
            continue;
        }
        const target = statements.find((s) => s.endOffset >= c.endOffset);
        if (target) {
            target.leadingComments = target.leadingComments ?? [];
            target.leadingComments.push(c.text);
            used.add(c);
        } else {
            // After the last statement, on a line of its own: it stays on a line of its own
            const last = statements.at(-1);
            if (last) {
                last.trailingComment = (last.trailingComment ?? '') + '\n' + c.text;
                used.add(c);
            }
        }
    }
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
