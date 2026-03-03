import { describe, it, expect } from 'vitest';
import { parse } from '../src/plugin/parser/index.js';

describe('parse()', () => {
    it('returns TSqlScript as root node', () => {
        const ast = parse('SELECT 1');
        expect(ast.type).toBe('TSqlScript');
    });

    it('parses a basic SELECT into correct node types', () => {
        const ast = parse('SELECT id, name FROM dbo.users WHERE active = 1');
        expect(ast.type).toBe('TSqlScript');

        const batches = ast.props?.['batches'] as typeof ast[];
        expect(batches).toBeDefined();
        expect(batches.length).toBeGreaterThan(0);

        const stmts = batches[0]!.props?.['statements'] as typeof ast[];
        expect(stmts[0]!.type).toBe('SelectStatement');
    });

    it('parses INSERT statement', () => {
        const ast = parse("INSERT INTO dbo.t (a, b) VALUES (1, 'x')");
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('InsertStatement');
    });

    it('parses UPDATE statement', () => {
        const ast = parse('UPDATE dbo.t SET a = 1 WHERE id = 2');
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('UpdateStatement');
    });

    it('parses DELETE statement', () => {
        const ast = parse('DELETE FROM dbo.t WHERE id = 1');
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('DeleteStatement');
    });

    it('parses CREATE TABLE statement', () => {
        const ast = parse('CREATE TABLE dbo.t (id INT NOT NULL, name NVARCHAR(100) NULL)');
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('CreateTableStatement');
    });

    it('parses CREATE PROCEDURE statement', () => {
        const ast = parse('CREATE PROCEDURE dbo.GetAll AS BEGIN SELECT * FROM dbo.t END');
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('CreateProcedureStatement');
    });

    it('throws SyntaxError on invalid SQL', () => {
        expect(() => parse('SELECT FROM WHERE')).toThrow(SyntaxError);
    });

    it('includes offset information', () => {
        const ast = parse('SELECT 1');
        expect(ast.startOffset).toBe(0);
        expect(ast.endOffset).toBeGreaterThan(0);
    });

    it('parses CTE correctly', () => {
        const ast = parse('WITH cte AS (SELECT 1 AS n) SELECT n FROM cte');
        const batch = (ast.props?.['batches'] as typeof ast[])[0]!;
        const stmt = (batch.props?.['statements'] as typeof ast[])[0]!;
        expect(stmt.type).toBe('SelectStatement');
        const ctes = stmt.props?.['ctes'] as typeof ast[];
        expect(ctes?.length).toBe(1);
        expect(ctes![0]!.type).toBe('CommonTableExpression');
    });

    it('parses window functions', () => {
        const ast = parse('SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn FROM dbo.emp');
        expect(ast.type).toBe('TSqlScript');
        // Just verify it parses without error
    });

    it('bodyStart offset lands on BEGIN keyword in CREATE PROCEDURE', () => {
        // bodyStart = StatementList.StartOffset which ScriptDom places at BEGIN.
        // This is the boundary used by comment-attachment to separate
        // preBodyComments (before BEGIN) from inner-body comments (after BEGIN).
        const sql = 'CREATE PROCEDURE dbo.Foo\n@p1 int\n/*c1*/\nAS\nBEGIN\n  /*c2*/\n  SELECT 1\nEND';
        const ast = parse(sql);
        const stmt = ((ast.props!['batches'] as any[])[0].props['statements'] as any[])[0];
        const bodyStart = stmt.props['bodyStart'] as number;
        expect(bodyStart).toBe(sql.indexOf('BEGIN'));
    });
});
