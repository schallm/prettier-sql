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
    // Prettier's locStart / locEnd (range formatting, cursor offsets) count UTF-16 code units
    toCharOffsets(result.ast, text);

    return result.ast;
}

/**
 * libpg_query reports UTF-8 byte offsets; turn every node's offsets into string indexes.
 * The same for ASCII text, so then there's nothing to do.
 */
function toCharOffsets(ast: SqlNode, text: string): void {
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength === text.length) return;
    // charAt[b]: the string index of the character the byte at b belongs to
    const charAt = new Int32Array(byteLength + 1);
    let b = 0;
    for (let i = 0; i < text.length; ) {
        const cp = text.codePointAt(i)!;
        const bytes = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
        charAt.fill(i, b, b + bytes);
        b += bytes;
        i += cp > 0xffff ? 2 : 1;
    }
    charAt[byteLength] = text.length;
    const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (!v || typeof v !== 'object') return;
        const n = v as SqlNode;
        if (typeof n.type !== 'string') return;
        n.startOffset = charAt[Math.min(n.startOffset, byteLength)]!;
        n.endOffset = charAt[Math.min(n.endOffset, byteLength)]!;
        Object.values(n.props ?? {}).forEach(walk);
    };
    walk(ast);
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
