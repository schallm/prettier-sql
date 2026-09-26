import type { SqlNode, CommentToken } from '@prettier-sql/core/types';
import { loadDotnetDll, type DotnetHandle } from '@prettier-sql/core/parser';

// ---------------------------------------------------------------------------
// DLL loading
// ---------------------------------------------------------------------------

interface PgsqlDotnet extends DotnetHandle {
    PrettierPgsql: { PgsqlParser: { Parse(sql: string): string; Canonical(sql: string): string | null } };
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
        attachComments(result.ast, result.comments);
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

// ---------------------------------------------------------------------------
// Comment attachment
// ---------------------------------------------------------------------------

function attachComments(ast: SqlNode, comments: CommentToken[]): void {
    const used = new Set<CommentToken>();
    const statements = (ast.props?.['statements'] ?? []) as SqlNode[];

    for (const c of comments.sort((a, b) => a.startOffset - b.startOffset)) {
        const target = statements.find((s) => s.endOffset >= c.endOffset);
        if (target) {
            target.leadingComments = target.leadingComments ?? [];
            target.leadingComments.push(c.text);
            used.add(c);
        } else {
            const last = statements.at(-1);
            if (last) {
                last.trailingComment = last.trailingComment ? last.trailingComment + '\n' + c.text : c.text;
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
