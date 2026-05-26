import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
    const provider: vscode.DocumentFormattingEditProvider = {
        async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
            return format(document, context.extensionPath);
        },
    };

    for (const langId of ['sql', 'tsql', 'pgsql']) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(langId, provider),
        );
    }

    // Register the palette command as an alias for the built-in format action
    context.subscriptions.push(
        vscode.commands.registerCommand('prettierSql.formatDocument', () =>
            vscode.commands.executeCommand('editor.action.formatDocument'),
        ),
    );

    checkDotnetRuntime();
}

/** Determine which SQL dialect to use for a given document. */
function resolveDialect(document: vscode.TextDocument): 'tsql' | 'pgsql' {
    // Unambiguous language IDs win immediately
    if (document.languageId === 'tsql') return 'tsql';
    if (document.languageId === 'pgsql') return 'pgsql';

    // Scan the first 5 lines for a directive comment: --tsql or --pgsql
    const lineCount = document.lineCount;
    const scanEnd = Math.min(5, lineCount);
    const firstLines = document.getText(new vscode.Range(0, 0, scanEnd, 0));
    if (/--\s*pgsql\b/i.test(firstLines)) return 'pgsql';
    if (/--\s*tsql\b/i.test(firstLines)) return 'tsql';

    // Fall back to workspace setting (default: tsql)
    const cfg = vscode.workspace.getConfiguration('prettierSql', document.uri);
    return cfg.get<string>('defaultDialect') === 'pgsql' ? 'pgsql' : 'tsql';
}

async function format(
    document: vscode.TextDocument,
    extensionPath: string,
): Promise<vscode.TextEdit[]> {
    const dialect = resolveDialect(document);
    const script = path.join(extensionPath, 'bundled', 'format.mjs');
    const cfg = vscode.workspace.getConfiguration('prettierSql', document.uri);

    const opts: Record<string, unknown> = {
        sqlKeywordCase: cfg.get<string>('sqlKeywordCase'),
        sqlDensity: cfg.get<string>('sqlDensity'),
        sqlCommaStyle: cfg.get<string>('sqlCommaStyle'),
        printWidth: cfg.get<number>('printWidth'),
    };

    const sql = document.getText();

    return new Promise<vscode.TextEdit[]>((resolve) => {
        let out = '';
        let err = '';

        // argv[2] = JSON options   argv[3] = file path (.prettierrc resolution)   argv[4] = dialect
        const proc = spawn(
            process.execPath,
            [script, JSON.stringify(opts), document.uri.fsPath, dialect],
            { stdio: ['pipe', 'pipe', 'pipe'] },
        );

        proc.stdout.on('data', (d: Buffer) => (out += d.toString('utf-8')));
        proc.stderr.on('data', (d: Buffer) => (err += d.toString('utf-8')));
        proc.stdin.write(sql, 'utf-8');
        proc.stdin.end();

        proc.on('close', (code: number | null) => {
            if (code === 0) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(sql.length),
                );
                resolve([vscode.TextEdit.replace(fullRange, out)]);
            } else {
                const msg = err.trim() || `formatter exited with code ${code}`;
                void vscode.window.showErrorMessage(`Prettier SQL (${dialect}): ${msg}`);
                resolve([]); // leave document unchanged
            }
        });

        proc.on('error', (e: Error) => {
            void vscode.window.showErrorMessage(`Prettier SQL: failed to start formatter — ${e.message}`);
            resolve([]);
        });
    });
}

/** Warn the user if no .NET 8+ runtime is available (required for the parser DLL). */
function checkDotnetRuntime(): void {
    const { execSync } = require('child_process') as typeof import('child_process');
    try {
        const output = execSync('dotnet --list-runtimes', { encoding: 'utf-8', timeout: 5000 });
        const hasNet8 = /Microsoft\.NETCore\.App 8\.|Microsoft\.NETCore\.App 9\./.test(output);
        if (!hasNet8) {
            promptDotnetDownload();
        }
    } catch {
        promptDotnetDownload();
    }
}

function promptDotnetDownload(): void {
    void vscode.window
        .showWarningMessage(
            'Prettier SQL requires the .NET 8 Runtime (or later). Click Download to get it.',
            'Download',
            'Dismiss',
        )
        .then((btn: string | undefined) => {
            if (btn === 'Download') {
                void vscode.env.openExternal(
                    vscode.Uri.parse('https://dotnet.microsoft.com/download/dotnet/8.0'),
                );
            }
        });
}

export function deactivate(): void {
    // nothing to clean up — child processes are short-lived
}
