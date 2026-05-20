import type { SqlNode, CommentToken } from '@prettier-sql/core/types';
import { loadDotnetDll, type DotnetHandle } from '@prettier-sql/core/parser';

// ---------------------------------------------------------------------------
// DLL loading
// ---------------------------------------------------------------------------

interface PgsqlDotnet extends DotnetHandle {
    PrettierPgsql: { SqlParser: { Parse(sql: string): string } };
}

let dotnetModule: PgsqlDotnet | null = null;

function loadDotnet(): PgsqlDotnet {
    if (dotnetModule) return dotnetModule;
    dotnetModule = loadDotnetDll(import.meta.url, 'PgScriptDom.dll', 'prettier-plugin-pgsql') as PgsqlDotnet;
    return dotnetModule;
}

// ---------------------------------------------------------------------------
// Public parse entry point
// ---------------------------------------------------------------------------

export function parse(text: string): SqlNode {
    const { SqlParser } = loadDotnet().PrettierPgsql;
    const result = JSON.parse(SqlParser.Parse(text)) as {
        ast?: SqlNode;
        comments?: CommentToken[];
        errors?: Array<{ message: string; line: number; column: number }>;
    };

    if (result.errors?.length) {
        const e = result.errors[0]!;
        throw new SyntaxError(`PostgreSQL parse error at ${e.line}:${e.column}: ${e.message}`);
    }

    if (!result.ast) {
        throw new Error('Parser returned no AST and no errors');
    }

    if (result.comments?.length) {
        attachComments(result.ast, result.comments);
    }

    return result.ast;
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
