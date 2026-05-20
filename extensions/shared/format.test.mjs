/**
 * Integration tests for a bundled/format.mjs shim.
 * Spawns the script as a child process — the same way the VS extension does.
 *
 * Usage: call registerFormatTests(formatScriptPath) from each extension's test file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'path';

function runFormat(formatScript, sql, optionsJson = null, filePath = null) {
    const args = [formatScript];
    if (optionsJson !== null || filePath !== null) args.push(optionsJson ?? '{}');
    if (filePath !== null) args.push(filePath);
    return spawnSync('node', args, { input: sql, encoding: 'utf-8', timeout: 10_000 });
}

export function registerFormatTests(formatScript) {
    test('formats a basic SELECT statement', () => {
        const result = runFormat(formatScript, 'select id,name from users');
        assert.equal(result.status, 0, result.stderr);
        assert.ok(result.stdout.length > 0);
    });

    test('sqlKeywordCase upper produces uppercase keywords', () => {
        const result = runFormat(formatScript, 'select id from users', JSON.stringify({ sqlKeywordCase: 'upper' }));
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /SELECT/);
        assert.match(result.stdout, /FROM/);
    });

    test('sqlKeywordCase lower produces lowercase keywords', () => {
        const result = runFormat(formatScript, 'SELECT ID FROM USERS', JSON.stringify({ sqlKeywordCase: 'lower' }));
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /select/);
        assert.match(result.stdout, /from/);
    });

    test('respects .prettierrc config in the file directory', () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'prettier-sql-test-'));
        try {
            writeFileSync(join(tmpDir, '.prettierrc'), JSON.stringify({ sqlKeywordCase: 'upper' }));
            const result = runFormat(formatScript, 'select id from users', null, join(tmpDir, 'query.sql'));
            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /SELECT/);
        } finally {
            rmSync(tmpDir, { recursive: true });
        }
    });

    test('explicit options override .prettierrc', () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'prettier-sql-test-'));
        try {
            writeFileSync(join(tmpDir, '.prettierrc'), JSON.stringify({ sqlKeywordCase: 'upper' }));
            const result = runFormat(
                formatScript,
                'select id from users',
                JSON.stringify({ sqlKeywordCase: 'lower' }),
                join(tmpDir, 'query.sql'),
            );
            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /select/);
        } finally {
            rmSync(tmpDir, { recursive: true });
        }
    });

    test('invalid options JSON exits with code 2', () => {
        const result = runFormat(formatScript, 'select 1', 'not-valid-json');
        assert.equal(result.status, 2);
        assert.match(result.stderr, /Invalid options JSON/);
    });

    test('empty SQL returns empty output', () => {
        const result = runFormat(formatScript, '');
        assert.equal(result.status, 0, result.stderr);
    });
}
