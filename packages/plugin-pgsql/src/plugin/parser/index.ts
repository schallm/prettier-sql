import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SqlNode, CommentToken } from '@prettier-sql/core/types';

// ---------------------------------------------------------------------------
// DLL loading
// ---------------------------------------------------------------------------

interface DotnetModule {
    load(dllPath: string): void;
    PrettierPgsql: {
        SqlParser: { Parse(sql: string): string };
    };
}

let dotnetModule: DotnetModule | null = null;

function loadDotnet(): DotnetModule {
    if (dotnetModule) return dotnetModule;

    const require = createRequire(import.meta.url);
    const dotnet = require('node-api-dotnet') as DotnetModule;

    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const isCompiled = thisDir.endsWith(path.join('dist', 'parser')) || thisDir.endsWith('dist/parser');
    const dllPath = isCompiled
        ? path.resolve(thisDir, '../../bin/dotnet/PgScriptDom.dll')
        : path.resolve(thisDir, '../../../bin/dotnet/PgScriptDom.dll');

    try {
        dotnet.load(dllPath);
    } catch (e) {
        throw new Error(
            `prettier-plugin-pgsql: failed to load PgScriptDom.dll from "${dllPath}". ` +
                `Make sure .NET 8+ is installed and the package was installed correctly. ` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    dotnetModule = dotnet;
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
