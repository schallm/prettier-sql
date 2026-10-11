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

    test('uses the bundled plugin when .prettierrc lists plugins', () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'prettier-sql-test-'));
        try {
            writeFileSync(join(tmpDir, '.prettierrc'), JSON.stringify({ plugins: ['prettier-plugin-tsql', 'prettier-plugin-postgresql'], sqlKeywordCase: 'upper' }));
            const result = runFormat(formatScript, 'select id from users', null, join(tmpDir, 'query.sql'));
            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /SELECT/);
        } finally {
            rmSync(tmpDir, { recursive: true });
        }
    });

    test('keeps CRLF line endings', () => {
        const result = runFormat(formatScript, 'select id,\r\nname from users\r\n');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /\r\n/);
        assert.doesNotMatch(result.stdout, /[^\r]\n/);
    });

    test('round-trips non-ASCII text', () => {
        const result = runFormat(formatScript, "select N'Müller 日本' as x -- ü\n");
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Müller 日本/);
        assert.match(result.stdout, /-- ü/);
    });

    // Range formatting: the extension passes rangeStart / rangeEnd and takes back the whole text
    const formatRangeOf = (sql, start, end) => runFormat(formatScript, sql, JSON.stringify({ rangeStart: start, rangeEnd: end }));

    test('range: formats only the selected statement', () => {
        const sql = 'select   a,b   from t;\nselect   c,d   from u;\nselect   e   from v;\n';
        const start = sql.indexOf('select   c');
        const result = formatRangeOf(sql, start + 3, start + 10);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'select   a,b   from t;\nselect\n    c,\n    d\nfrom u;\nselect   e   from v;\n');
    });

    test('range: a cursor formats the statement it is in', () => {
        const sql = 'select   a   from t;\nselect   c   from u;\n';
        const at = sql.indexOf('c   from');
        const result = formatRangeOf(sql, at, at);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'select   a   from t;\nselect c\nfrom u;\n');
    });

    test('range: a selection spanning statements formats each of them', () => {
        const sql = 'select   a   from t;\nselect   c   from u;\nselect   e   from v;\n';
        const result = formatRangeOf(sql, sql.indexOf('a   from'), sql.indexOf('c   from'));
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'select a\nfrom t;\n\nselect c\nfrom u;\nselect   e   from v;\n');
    });

    test('range: a selection of only blank space changes nothing', () => {
        const sql = 'select   a   from t;\n\n\nselect   c   from u;\n';
        const at = sql.indexOf('\n\n') + 1;
        const result = formatRangeOf(sql, at, at + 1);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, sql);
    });

    test('range: offsets count UTF-16 code units after non-ASCII text', () => {
        const sql = "select N'Müller 日本 😀' as x;\nselect   c,d   from u;\n";
        const start = sql.indexOf('select   c');
        const result = formatRangeOf(sql, start, start + 1);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "select N'Müller 日本 😀' as x;\nselect\n    c,\n    d\nfrom u;\n");
    });

    if (formatScript.includes('tsql')) {
        test('range: a statement followed by GO keeps one GO', () => {
            const sql = 'create view v as select   a   from t\ngo\nselect 1\n';
            const result = formatRangeOf(sql, 0, 5);
            assert.equal(result.status, 0, result.stderr);
            assert.equal(result.stdout.match(/^go$/gim)?.length, 1, result.stdout);
            assert.match(result.stdout, /\nselect 1\n$/);
        });
    }

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
