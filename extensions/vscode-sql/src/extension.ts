import * as vscode from 'vscode';
import { spawn, execSync } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
    const wholeDocProvider: vscode.DocumentFormattingEditProvider = {
        async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
            return formatDocument(document, context.extensionPath);
        },
    };

    const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
        async provideDocumentRangeFormattingEdits(
            document: vscode.TextDocument,
            range: vscode.Range,
        ): Promise<vscode.TextEdit[]> {
            return formatRange(document, range, context.extensionPath);
        },
    };

    for (const langId of ['sql', 'tsql', 'pgsql']) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(langId, wholeDocProvider),
            vscode.languages.registerDocumentRangeFormattingEditProvider(langId, rangeProvider),
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

function getOpts(document: vscode.TextDocument): Record<string, unknown> {
    const cfg = vscode.workspace.getConfiguration('prettierSql', document.uri);
    return {
        sqlKeywordCase: cfg.get<string>('sqlKeywordCase'),
        sqlDensity: cfg.get<string>('sqlDensity'),
        sqlCommaStyle: cfg.get<string>('sqlCommaStyle'),
        printWidth: cfg.get<number>('printWidth'),
    };
}

/** Spawn the formatter child process, pipe sql in, resolve with formatted output. */
function runFormatter(
    sql: string,
    dialect: string,
    script: string,
    opts: Record<string, unknown>,
    filePath: string,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let out = '';
        let err = '';

        // argv[2] = JSON options   argv[3] = file path (.prettierrc resolution)   argv[4] = dialect
        const proc = spawn(process.execPath, [script, JSON.stringify(opts), filePath, dialect], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        proc.stdout.on('data', (d: Buffer) => (out += d.toString('utf-8')));
        proc.stderr.on('data', (d: Buffer) => (err += d.toString('utf-8')));
        proc.stdin.write(sql, 'utf-8');
        proc.stdin.end();

        proc.on('close', (code: number | null) => {
            if (code === 0) {
                resolve(out);
            } else {
                reject(new Error(err.trim() || `formatter exited with code ${code}`));
            }
        });

        proc.on('error', (e: Error) => {
            reject(new Error(`failed to start formatter — ${e.message}`));
        });
    });
}

async function formatDocument(
    document: vscode.TextDocument,
    extensionPath: string,
): Promise<vscode.TextEdit[]> {
    const dialect = resolveDialect(document);
    const script = path.join(extensionPath, 'bundled', 'format.mjs');
    const sql = document.getText();

    try {
        const formatted = await runFormatter(sql, dialect, script, getOpts(document), document.uri.fsPath);
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(sql.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Prettier SQL (${dialect}): ${msg}`);
        return [];
    }
}

async function formatRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    extensionPath: string,
): Promise<vscode.TextEdit[]> {
    const dialect = resolveDialect(document);
    const script = path.join(extensionPath, 'bundled', 'format.mjs');
    const sql = document.getText();

    // Pass the full document with rangeStart/rangeEnd so Prettier can expand the
    // selection to complete statement boundaries using our locStart/locEnd offsets.
    // Prettier returns the full document with only the in-range statements reformatted
    // and all out-of-range content preserved verbatim.
    const opts = {
        ...getOpts(document),
        rangeStart: document.offsetAt(range.start),
        rangeEnd: document.offsetAt(range.end),
    };

    try {
        const formatted = await runFormatter(sql, dialect, script, opts, document.uri.fsPath);
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(sql.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Prettier SQL (${dialect}): ${msg}`);
        return [];
    }
}

/** Warn the user if no .NET 8+ runtime is available (required for the parser DLL). */
function checkDotnetRuntime(): void {
    try {
        const output = execSync('dotnet --list-runtimes', { encoding: 'utf-8', timeout: 5000 });
        const match = /Microsoft\.NETCore\.App (\d+)\./.exec(output);
        const hasNet8Plus = match !== null && parseInt(match[1]!, 10) >= 8;
        if (!hasNet8Plus) {
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
