import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import plugin from '../src/plugin/index.js';

// Schema used throughout these tests:
//   dbo.Books        (book_id, title, author_id, publisher_id, genre_id, price, in_stock, published_date)
//   dbo.Authors      (author_id, first_name, last_name, country, publisher_id)
//   dbo.Publishers   (publisher_id, name, country)
//   dbo.Genres       (genre_id, name)
//   dbo.Customers    (customer_id, name, email, active, last_purchase_date)
//   dbo.Orders       (order_id, customer_id, total, order_date, status)
//   dbo.OrderItems   (order_item_id, order_id, book_id, quantity, unit_price)
//   dbo.ArchivedBooks  (same columns as Books)

async function fmt(sql: string, opts: Record<string, unknown> = {}): Promise<string> {
    return prettier.format(sql, {
        parser: 'tsql',
        plugins: [plugin],
        printWidth: 80,
        ...opts,
    });
}

describe('SELECT formatting', () => {
    it('basic select with join and where', async () => {
        const result = await fmt(
            'select b.book_id,b.title,b.price from dbo.Books as b inner join dbo.Authors as a on b.author_id=a.author_id where b.in_stock=1 order by b.title asc'
        );
        expect(result).toMatchSnapshot();
    });

    it('searched CASE with AND condition', async () => {
        const result = await fmt(
            'select case when b.author_id is not null and b.genre_id in (1, 2, 3) then 1 else 0 end as IsAvailable from dbo.Books as b'
        );
        expect(result).toMatchSnapshot();
    });

    it('nested CASE in THEN branch indents inner case on new line', async () => {
        const sql = `
select
  case
    when ContentType = 'movie' then case
      when BoxOfficeTotal is null or BoxOfficeTotal < 250000000 then 2.78
      else 3.69
    end
    when ContentType = 'tv-episode' then case
      when ContentLength < 30 * 60 then 0.61
      else 0.91
    end
    else -1
  end as AgencyCost
from dbo.Content`;
        const result = await fmt(sql);
        // Inner case must start on its own line, not on the same line as THEN
        const lines = result.split('\n');
        const thenLines = lines.filter(l => l.trimStart().startsWith('then'));
        expect(thenLines.every(l => !l.includes('case'))).toBe(true);
        expect(result).toMatchSnapshot();
    });

    it('SELECT DISTINCT', async () => {
        const result = await fmt('select distinct genre_id from dbo.Books');
        expect(result).toMatchSnapshot();
    });

    it('aggregate with GROUP BY / HAVING', async () => {
        const result = await fmt(
            'select genre_id, count(*) as cnt, avg(price) as avg_price from dbo.Books group by genre_id having count(*) > 5'
        );
        expect(result).toMatchSnapshot();
    });

    it('GROUP BY ROLLUP respects keyword case', async () => {
        const lower = await fmt(
            'SELECT genre_id, author_id, SUM(price) AS total FROM dbo.Books GROUP BY ROLLUP (genre_id, author_id)'
        );
        expect(lower).toContain('rollup(');
        expect(lower).toMatchSnapshot();

        const upper = await fmt(
            'SELECT genre_id, author_id, SUM(price) AS total FROM dbo.Books GROUP BY ROLLUP (genre_id, author_id)',
            { sqlKeywordCase: 'upper' }
        );
        expect(upper).toContain('ROLLUP(');
    });

    it('GROUP BY CUBE respects keyword case', async () => {
        const result = await fmt(
            'SELECT genre_id, in_stock, COUNT(*) AS cnt FROM dbo.Books GROUP BY CUBE (genre_id, in_stock)',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('CUBE(');
        expect(result).toMatchSnapshot();
    });

    it('GROUP BY GROUPING SETS with composite groups and grand total', async () => {
        const lower = await fmt(
            'SELECT genre_id, author_id, SUM(price) AS total FROM dbo.Books GROUP BY GROUPING SETS ((genre_id, author_id), (genre_id), ())'
        );
        expect(lower).toContain('grouping sets(');
        expect(lower).toMatchSnapshot();

        const upper = await fmt(
            'SELECT genre_id, author_id, SUM(price) AS total FROM dbo.Books GROUP BY GROUPING SETS ((genre_id, author_id), (genre_id), ())',
            { sqlKeywordCase: 'upper' }
        );
        expect(upper).toContain('GROUPING SETS(');
    });

    it('CTE', async () => {
        const result = await fmt(
            'with available_books as (select book_id, title from dbo.Books where in_stock = 1) select b.title from available_books as b order by b.title asc'
        );
        expect(result).toMatchSnapshot();
    });

    it('window functions', async () => {
        const result = await fmt(
            'select book_id, price, row_number() over (partition by genre_id order by price desc) as rn from dbo.Books'
        );
        expect(result).toMatchSnapshot();
    });

    it('subquery in WHERE', async () => {
        const result = await fmt(
            'select book_id, title from dbo.Books where book_id in (select book_id from dbo.OrderItems where unit_price > 50)'
        );
        expect(result).toMatchSnapshot();
    });

    it('keyword case: lower', async () => {
        const result = await fmt('SELECT book_id FROM dbo.Books WHERE in_stock = 1', {
            sqlKeywordCase: 'lower',
        });
        expect(result).toContain('select');
        expect(result).toContain('from');
        expect(result).toContain('where');
    });

    it('keyword case: lower (default)', async () => {
        const result = await fmt('select book_id from dbo.Books where in_stock = 1');
        expect(result).toContain('select');
        expect(result).toContain('from');
        expect(result).toContain('where');
    });
});

describe('INSERT formatting', () => {
    it('VALUES insert', async () => {
        const result = await fmt(
            "insert into dbo.Customers (name, email, active) values ('Jane Smith', 'jane@example.com', 1)"
        );
        expect(result).toMatchSnapshot();
    });

    it('INSERT ... SELECT', async () => {
        const result = await fmt(
            'insert into dbo.ArchivedBooks (book_id, title) select book_id, title from dbo.Books where in_stock = 0'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('UPDATE formatting', () => {
    it('basic update', async () => {
        const result = await fmt(
            "update dbo.Books set title = 'Updated Title', price = 29.99 where book_id = 42"
        );
        expect(result).toMatchSnapshot();
    });

    it('update with join', async () => {
        const result = await fmt(
            'update b set b.in_stock = 0 from dbo.Books as b inner join dbo.Publishers as p on b.publisher_id = p.publisher_id where p.country = \'UK\''
        );
        expect(result).toMatchSnapshot();
    });
});

describe('DELETE formatting', () => {
    it('basic delete', async () => {
        const result = await fmt(
            'delete from dbo.Books where in_stock = 0 and published_date < dateadd(year, -10, getdate())'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('CREATE TABLE formatting', () => {
    it('basic table', async () => {
        const result = await fmt(
            'create table dbo.Books (book_id int not null identity(1,1), title nvarchar(200) not null, price decimal(10,2) not null, in_stock bit not null default 1, constraint pk_books primary key (book_id))'
        );
        expect(result).toMatchSnapshot();
    });

    it('table with foreign key constraint', async () => {
        const result = await fmt(
            'create table dbo.Orders (order_id int not null identity(1,1), customer_id int not null, total decimal(18,2) not null, constraint pk_orders primary key (order_id), constraint fk_orders_customers foreign key (customer_id) references dbo.Customers (customer_id))'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('ALTER TABLE formatting', () => {
    it('add column', async () => {
        const result = await fmt('alter table dbo.Books add isbn nvarchar(20) null');
        expect(result).toMatchSnapshot();
    });

    it('drop column', async () => {
        const result = await fmt('alter table dbo.Books drop column isbn');
        expect(result).toMatchSnapshot();
    });
});

describe('CREATE PROCEDURE formatting', () => {
    it('simple procedure', async () => {
        const result = await fmt(
            'create procedure dbo.GetAvailableBooks as begin select book_id, title from dbo.Books where in_stock = 1 end'
        );
        expect(result).toMatchSnapshot();
    });

    it('procedure with parameters', async () => {
        const result = await fmt(
            'create procedure dbo.GetBookById @id int, @includeOutOfStock bit = 0 as begin select book_id, title from dbo.Books where book_id = @id end'
        );
        expect(result).toMatchSnapshot();
    });

    it('block comment between procedure name and first parameter is preserved', async () => {
        const result = await fmt(
            'create procedure dbo.GetBookById\n' +
            '/**********************\n' +
            '** Author: Jon\n' +
            '** Date:   2012-01-10\n' +
            '**********************/\n' +
            '@id int, @includeOutOfStock bit = 0\n' +
            'as begin select book_id from dbo.Books where book_id = @id end'
        );
        expect(result).toContain('**********************');
        expect(result).toContain('Author: Jon');
        expect(result).toMatchSnapshot();
    });

    it('line comment inside procedure body is preserved', async () => {
        const result = await fmt(
            'create procedure dbo.GetAvailableBooks as begin\n' +
            '-- fetch available books only\n' +
            'select book_id, title from dbo.Books where in_stock = 1 end'
        );
        expect(result).toContain('-- fetch available books only');
        expect(result).toMatchSnapshot();
    });

    it('block comment after last parameter (before AS) stays between params and as', async () => {
        const result = await fmt(
            'create procedure dbo.GetBookById\n' +
            '@id int,\n' +
            '@active bit\n' +
            '/*WITH ENCRYPTION*/\n' +
            'as begin select book_id from dbo.Books where book_id = @id end'
        );
        expect(result).toContain('/*WITH ENCRYPTION*/');
        const lines = result.split('\n');
        const idxComment = lines.findIndex(l => l.includes('ENCRYPTION'));
        const idxAs = lines.findIndex(l => l.trim() === 'as');
        const idxBegin = lines.findIndex(l => l.trim() === 'begin');
        // comment must appear before AS, not inside BEGIN...END
        expect(idxComment).toBeLessThan(idxAs);
        expect(idxComment).toBeLessThan(idxBegin);
        expect(result).toMatchSnapshot();
    });
});

describe('comment preservation', () => {
    it('block comment after last statement in file is not lost', async () => {
        const result = await fmt(
            'select book_id from dbo.Books;\n/* end of queries */'
        );
        expect(result).toContain('/* end of queries */');
        expect(result).toMatchSnapshot();
    });

    it('line comment after last statement in file is not lost', async () => {
        const result = await fmt(
            'select book_id from dbo.Books;\n-- end of queries'
        );
        expect(result).toContain('-- end of queries');
        expect(result).toMatchSnapshot();
    });
});

describe('comma style option', () => {
    it('trailing commas (default)', async () => {
        const result = await fmt('select book_id, title, price from dbo.Books');
        expect(result).toMatchSnapshot();
    });
});

describe('density option', () => {
    const multiJoinSql =
        'select b.book_id, b.title from dbo.Books as b inner join dbo.Authors as a on b.author_id = a.author_id where b.in_stock = 1 order by b.title asc';
    const multiWhereSql =
        'select book_id from dbo.Books where in_stock = 1 and price < 100';
    const multiOnSql =
        'select b.book_id from dbo.Books as b inner join dbo.Authors as a on b.author_id = a.author_id and b.publisher_id = a.publisher_id';

    describe('compact', () => {
        it('single-line query stays inline', async () => {
            const result = await fmt('select book_id from dbo.Books where in_stock = 1', {
                sqlDensity: 'compact',
            });
            expect(result).toMatchSnapshot();
        });

        it('multiple predicates wrap at printWidth', async () => {
            const result = await fmt(multiWhereSql, { sqlDensity: 'compact' });
            expect(result).toMatchSnapshot();
        });

        it('join with ON inline', async () => {
            const result = await fmt(multiJoinSql, { sqlDensity: 'compact' });
            expect(result).toMatchSnapshot();
        });
    });

    describe('standard', () => {
        it('single WHERE predicate stays inline with keyword', async () => {
            const result = await fmt('select book_id from dbo.Books where in_stock = 1', {
                sqlDensity: 'standard',
            });
            expect(result).toContain('where in_stock = 1');
        });

        it('multiple WHERE predicates each on own line', async () => {
            const result = await fmt(multiWhereSql, { sqlDensity: 'standard' });
            expect(result).toContain('and price');
            expect(result).toMatchSnapshot();
        });

        it('single ON predicate stays inline', async () => {
            const result = await fmt(multiJoinSql, { sqlDensity: 'standard' });
            expect(result).toMatchSnapshot();
        });

        it('multiple ON predicates each on own line', async () => {
            const result = await fmt(multiOnSql, { sqlDensity: 'standard' });
            expect(result).toMatchSnapshot();
        });

        it('single ORDER BY stays inline', async () => {
            const result = await fmt(multiJoinSql, { sqlDensity: 'standard' });
            expect(result).toContain('order by b.title asc');
        });
    });

    describe('spacious', () => {
        it('single WHERE predicate on own line', async () => {
            const result = await fmt('select book_id from dbo.Books where in_stock = 1', {
                sqlDensity: 'spacious',
            });
            expect(result).not.toContain('where in_stock');
            expect(result).toMatchSnapshot();
        });

        it('single ON predicate on own line', async () => {
            const result = await fmt(multiJoinSql, { sqlDensity: 'spacious' });
            expect(result).not.toContain('on b.author_id');
            expect(result).toMatchSnapshot();
        });

        it('multiple ON predicates each on own line', async () => {
            const result = await fmt(multiOnSql, { sqlDensity: 'spacious' });
            expect(result).toMatchSnapshot();
        });
    });
});

describe('VIEW formatting', () => {
    it('CREATE OR ALTER VIEW basic', async () => {
        const result = await fmt(
            'create or alter view dbo.vw_available_books as select book_id, title from dbo.Books where in_stock = 1',
            { sqlKeywordCase: 'lower' }
        );
        expect(result).toMatchSnapshot();
    });

    it('block comment between view name and AS is preserved in place', async () => {
        // A block comment between the view name and AS must stay there.
        const sql = [
            'create or alter view [dbo].[vw_example]',
            '/* with encryption */',
            'as',
            'select book_id from dbo.Books;',
        ].join('\n');
        const result = await fmt(sql, { sqlKeywordCase: 'lower' });
        // Comment must appear after the view name, not before the create keyword
        expect(result).not.toMatch(/^\/\*/);
        const createIdx = result.indexOf('create or alter view');
        const commentIdx = result.indexOf('/* with encryption */');
        expect(commentIdx).toBeGreaterThan(createIdx);
        expect(result).toMatchSnapshot();
    });

    it('block comment inside first view does not appear before second view', async () => {
        // A block comment internal to one batch must not bleed into the next batch.
        const sql = [
            'create or alter view [dbo].[vw_first]',
            '/* with encryption */',
            'as',
            'select 1 as x;',
            'go',
            'create or alter view [dbo].[vw_second]',
            'as',
            'select 2 as y;',
        ].join('\n');
        const result = await fmt(sql, { sqlKeywordCase: 'lower' });
        const secondViewIdx = result.indexOf('create or alter view dbo.vw_second');
        const commentIdx = result.indexOf('/* with encryption */');
        expect(commentIdx).toBeLessThan(secondViewIdx);
        expect(result).toMatchSnapshot();
    });

    it('leading comment before CREATE VIEW attaches correctly', async () => {
        // A standalone comment on its own line before CREATE VIEW should be kept.
        const sql = [
            '-- view description',
            'create or alter view dbo.vw_test as select 1 as x;',
        ].join('\n');
        const result = await fmt(sql, { sqlKeywordCase: 'lower' });
        expect(result.trimStart()).toMatch(/^-- view description/);
        expect(result).toMatchSnapshot();
    });
});

describe('SET ROWCOUNT formatting', () => {
    it('SET ROWCOUNT with integer literal', async () => {
        const result = await fmt('SET ROWCOUNT 10');
        expect(result).toMatchSnapshot();
    });

    it('SET ROWCOUNT 0 resets to unlimited', async () => {
        const result = await fmt('SET ROWCOUNT 0');
        expect(result).toMatchSnapshot();
    });

    it('SET ROWCOUNT respects keyword case', async () => {
        const result = await fmt('SET ROWCOUNT 5', { sqlKeywordCase: 'lower' });
        expect(result).toContain('set rowcount');
        expect(result).toMatchSnapshot();
    });
});

describe('table hints', () => {
    it('NOLOCK on single table', async () => {
        const result = await fmt('select book_id from dbo.Books as b with (nolock)');
        expect(result).toContain('with (nolock)');
        expect(result).toMatchSnapshot();
    });

    it('multiple hints', async () => {
        const result = await fmt('select book_id from dbo.Books with (nolock, rowlock)');
        expect(result).toContain('with (nolock, rowlock)');
        expect(result).toMatchSnapshot();
    });

    it('NOLOCK on joined table', async () => {
        const result = await fmt(
            'select b.book_id, p.name from dbo.Books as b with (nolock) inner join dbo.Publishers as p with (nolock) on b.publisher_id = p.publisher_id'
        );
        expect(result).toContain('with (nolock)');
        expect(result).toMatchSnapshot();
    });

    it('hints respect keyword case upper', async () => {
        const result = await fmt('select book_id from dbo.Books with (nolock)', { sqlKeywordCase: 'upper' });
        expect(result).toContain('WITH (NOLOCK)');
        expect(result).toMatchSnapshot();
    });
});

describe('nested join formatting', () => {
    it('parenthesized nested join', async () => {
        const result = await fmt(
            'select b.title from dbo.Books as b left join (dbo.Authors as a inner join dbo.Publishers as p on a.publisher_id = p.publisher_id) on b.author_id = a.author_id'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('IN clause formatting', () => {
    it('short value list stays on one line', async () => {
        const result = await fmt('select book_id from dbo.Books where genre_id in (1, 2, 3)');
        expect(result).toContain('in (1, 2, 3)');
        expect(result).toMatchSnapshot();
    });

    it('long value list wraps each value to its own line', async () => {
        const result = await fmt(
            "select author_id from dbo.Authors where country in ('United States', 'United Kingdom', 'Canada', 'Australia', 'Germany')"
        );
        const lines = result.split('\n');
        // ) should be on its own line (not sharing a line with the last value)
        const closingLine = lines.find((l) => l.trimStart().startsWith(')'));
        expect(closingLine).toBeDefined();
        expect(result).toMatchSnapshot();
    });

    it('NOT IN short list stays inline', async () => {
        const result = await fmt('select book_id from dbo.Books where genre_id not in (1, 2)');
        expect(result).toContain('not in (1, 2)');
        expect(result).toMatchSnapshot();
    });

    it('IN subquery is unaffected', async () => {
        const result = await fmt(
            'select book_id from dbo.Books where book_id in (select book_id from dbo.OrderItems where unit_price > 50)'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('intra-WHERE comments', () => {
    it('commented-out predicates are preserved between active predicates', async () => {
        const sql = [
            'select book_id from dbo.Books',
            'where 1 = 1',
            '    and Books.genre_id in (1)',
            "    --and Books.genre_id in (select genre_id from dbo.Genres where name = 'Fiction')",
            '    and Books.publisher_id in (4)',
            '    --and Books.publisher_id in (select publisher_id from dbo.Publishers where country = \'UK\')',
            '    and Books.author_id in (101, 102)',
        ].join('\n');
        const result = await fmt(sql);
        // Both commented-out predicates must appear in output
        expect(result).toContain('--and Books.genre_id');
        expect(result).toContain('--and Books.publisher_id');
        // They must appear between their neighbouring active predicates
        const lines = result.split('\n');
        const idxGenreActive   = lines.findIndex(l => l.includes('genre_id in (1)'));
        const idxGenreComment  = lines.findIndex(l => l.includes('--and Books.genre_id'));
        const idxPubActive     = lines.findIndex(l => l.includes('publisher_id in (4)'));
        const idxPubComment    = lines.findIndex(l => l.includes('--and Books.publisher_id'));
        expect(idxGenreComment).toBeGreaterThan(idxGenreActive);
        expect(idxPubActive).toBeGreaterThan(idxGenreComment);
        expect(idxPubComment).toBeGreaterThan(idxPubActive);
        expect(result).toMatchSnapshot();
    });
});

describe('UNION / INTERSECT / EXCEPT formatting', () => {
    it('UNION ALL has blank lines before and after the operator', async () => {
        const result = await fmt(
            'select book_id, title from dbo.Books where in_stock = 1 union all select book_id, title from dbo.ArchivedBooks'
        );
        // blank line before and after "union all"
        const lines = result.split('\n');
        const idxOp = lines.findIndex(l => l.trim() === 'union all');
        expect(idxOp).toBeGreaterThan(0);
        expect(lines[idxOp - 1]).toBe('');
        expect(lines[idxOp + 1]).toBe('');
        expect(result).toMatchSnapshot();
    });

    it('UNION (distinct) has blank lines around the operator', async () => {
        const result = await fmt(
            'select author_id from dbo.Books union select author_id from dbo.ArchivedBooks'
        );
        const lines = result.split('\n');
        const idxOp = lines.findIndex(l => l.trim() === 'union');
        expect(lines[idxOp - 1]).toBe('');
        expect(lines[idxOp + 1]).toBe('');
        expect(result).toMatchSnapshot();
    });
});

describe('OPTION clause formatting', () => {
    it('OPTION (RECOMPILE) is preserved on its own line', async () => {
        const result = await fmt(
            'select book_id, title from dbo.Books where in_stock = 1 option (recompile)'
        );
        expect(result).toContain('option (recompile)');
        expect(result).toMatchSnapshot();
    });

    it('OPTION clause respects keyword case upper', async () => {
        const result = await fmt(
            'select book_id from dbo.Books option (recompile)',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('OPTION');
        expect(result).toMatchSnapshot();
    });

    it('OPTION clause with ORDER BY appears after ORDER BY', async () => {
        const result = await fmt(
            'select book_id, title from dbo.Books where in_stock = 1 order by title asc option (recompile)'
        );
        const lines = result.split('\n');
        const idxOption = lines.findIndex(l => l.trim().startsWith('option'));
        const idxOrder  = lines.findIndex(l => l.trim().startsWith('order by'));
        expect(idxOption).toBeGreaterThan(idxOrder);
        expect(result).toMatchSnapshot();
    });
});

describe('comment between JOIN clauses', () => {
    it('line comment between two joins is preserved on its own line', async () => {
        const sql = `
select b.book_id, b.title
from dbo.Books as b
inner join dbo.Authors as a on b.author_id = a.author_id
-- left join: publishers may not exist for all books
left join dbo.Publishers as p on b.publisher_id = p.publisher_id`;
        const result = await fmt(sql);
        expect(result).toContain('-- left join: publishers may not exist for all books');
        const lines = result.split('\n');
        const commentIdx = lines.findIndex(l => l.trim().startsWith('--'));
        const leftJoinIdx = lines.findIndex(l => l.trim().startsWith('left join'));
        // comment must appear on its own line, immediately before the left join
        expect(commentIdx).toBeGreaterThan(0);
        expect(leftJoinIdx).toBe(commentIdx + 1);
        expect(result).toMatchSnapshot();
    });

    it('multiple comments between joins are all preserved', async () => {
        const sql = `
select b.book_id from dbo.Books as b
inner join dbo.Authors as a on b.author_id = a.author_id
-- optional: genre
left join dbo.Genres as g on b.genre_id = g.genre_id
-- optional: publisher
left join dbo.Publishers as p on b.publisher_id = p.publisher_id`;
        const result = await fmt(sql);
        expect(result).toContain('-- optional: genre');
        expect(result).toContain('-- optional: publisher');
        expect(result).toMatchSnapshot();
    });
});

describe('derived table (subquery in FROM)', () => {
    it('simple derived table with alias', async () => {
        const result = await fmt(
            'select b.title, b.price from (select title, price from dbo.Books where in_stock = 1) as b'
        );
        expect(result).toMatchSnapshot();
    });

    it('derived table joined to another table', async () => {
        const result = await fmt(
            'select b.title, a.last_name from (select book_id, title, author_id from dbo.Books where price > 20) as b inner join dbo.Authors as a on b.author_id = a.author_id'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('expression functions', () => {
    it('CAST preserves length', async () => {
        const result = await fmt("select cast(title as nvarchar(100)) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NVARCHAR(100)');
        expect(result).toMatchSnapshot();
    });

    it('CONVERT preserves length and style', async () => {
        const result = await fmt("select convert(nvarchar(50), price, 1) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NVARCHAR(50)');
        expect(result).toMatchSnapshot();
    });

    it('IIF expression', async () => {
        const result = await fmt("select iif(in_stock = 1, 'yes', 'no') from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('IIF(');
        expect(result).toMatchSnapshot();
    });

    it('COALESCE expression', async () => {
        const result = await fmt("select coalesce(price, 0.0) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('COALESCE(');
        expect(result).toMatchSnapshot();
    });

    it('NULLIF expression', async () => {
        const result = await fmt("select nullif(price, 0) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NULLIF(');
        expect(result).toMatchSnapshot();
    });

    it('TRY_CAST expression', async () => {
        const result = await fmt("select try_cast(title as int) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('TRY_CAST(');
        expect(result).toMatchSnapshot();
    });

    it('TRY_CONVERT expression', async () => {
        const result = await fmt("select try_convert(decimal(10,2), price) from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('TRY_CONVERT(');
        expect(result).toMatchSnapshot();
    });

    it('AT TIME ZONE expression', async () => {
        const result = await fmt("select getdate() at time zone 'UTC' from dbo.Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('AT TIME ZONE');
        expect(result).toMatchSnapshot();
    });

    it('TVF in FROM clause', async () => {
        const result = await fmt("select * from dbo.GetBooks(1) as b");
        expect(result).toContain('GetBooks(');
        expect(result).toMatchSnapshot();
    });

    it('short string concatenation stays on one line', async () => {
        const result = await fmt("select isnull(last_nm, '') + ', ' + isnull(first_nm, '') as full_nm from dbo.Authors");
        expect(result).toMatchSnapshot();
    });

    it('long string concatenation breaks before + not inside function args', async () => {
        const sql = "select isnull(VID.LastNm, '') + ', ' + isnull(VID.FirstNm, '') + ' ' + isnull(VID.MiddleNm, '') + ' ' + isnull(S.Suffix, '') as VisitorNm from dbo.Visitors as VID inner join dbo.Suffixes as S on VID.SuffixId = S.SuffixId";
        const result = await fmt(sql);
        // breaks at + operators, never inside a function call's args
        expect(result).not.toMatch(/isnull\(\s*\n/);
        expect(result).toMatchSnapshot();
    });
});

describe('Control flow & DDL additions', () => {
    it('TRUNCATE TABLE', async () => {
        const result = await fmt('truncate table dbo.Books');
        expect(result).toMatchInlineSnapshot(`"truncate table dbo.Books;"`);
    });

    it('TRUNCATE TABLE uppercase', async () => {
        const result = await fmt('TRUNCATE TABLE dbo.Books', { sqlKeywordCase: 'upper' });
        expect(result).toMatchInlineSnapshot(`"TRUNCATE TABLE dbo.Books;"`);
    });

    it('BREAK statement', async () => {
        const result = await fmt('break');
        expect(result).toMatchInlineSnapshot(`"break;"`);
    });

    it('CONTINUE statement', async () => {
        const result = await fmt('continue');
        expect(result).toMatchInlineSnapshot(`"continue;"`);
    });

    it('GOTO statement', async () => {
        const result = await fmt('goto exit_label');
        expect(result).toMatchInlineSnapshot(`"goto exit_label;"`);
    });

    it('LABEL statement', async () => {
        const result = await fmt('exit_label:');
        // ScriptDom LabelStatement.Value includes the trailing colon
        expect(result.trim()).toBe('exit_label:');
    });

    it('THROW with no args', async () => {
        const result = await fmt('throw');
        expect(result).toMatchInlineSnapshot(`"throw;"`);
    });

    it('THROW with args', async () => {
        const result = await fmt("throw 50001, 'Not found', 1");
        expect(result).toMatchInlineSnapshot(`"throw 50001, 'Not found', 1;"`);
    });

    it('RAISERROR statement', async () => {
        const result = await fmt("raiserror ('Not found', 16, 1)");
        expect(result).toMatchInlineSnapshot(`"raiserror ('Not found', 16, 1);"`);
    });

    it('TRY/CATCH block', async () => {
        const sql = `
begin try
  select book_id from dbo.Books;
end try
begin catch
  throw;
end catch`;
        const result = await fmt(sql);
        expect(result).toContain('begin try');
        expect(result).toContain('end try');
        expect(result).toContain('begin catch');
        expect(result).toContain('end catch');
        expect(result).toMatchSnapshot();
    });

    it('DROP TABLE', async () => {
        const result = await fmt('drop table dbo.Books');
        expect(result).toMatchInlineSnapshot(`"drop table dbo.Books;"`);
    });

    it('DROP TABLE IF EXISTS', async () => {
        const result = await fmt('drop table if exists dbo.Books');
        expect(result).toMatchInlineSnapshot(`"drop table if exists dbo.Books;"`);
    });

    it('DROP PROCEDURE', async () => {
        const result = await fmt('drop procedure dbo.GetBooks');
        expect(result).toMatchInlineSnapshot(`"drop procedure dbo.GetBooks;"`);
    });

    it('DROP VIEW', async () => {
        const result = await fmt('drop view dbo.vw_available_books');
        expect(result).toMatchInlineSnapshot(`"drop view dbo.vw_available_books;"`);
    });

    it('DROP FUNCTION', async () => {
        const result = await fmt('drop function dbo.GetBookPrice');
        expect(result).toMatchInlineSnapshot(`"drop function dbo.GetBookPrice;"`);
    });

    it('DROP INDEX', async () => {
        const result = await fmt('drop index ix_title on dbo.Books');
        expect(result).toMatchInlineSnapshot(`"drop index ix_title on dbo.Books;"`);
    });

    it('CREATE OR ALTER PROCEDURE emits correct keyword and GO', async () => {
        const sql = `create or alter procedure dbo.GetBooks as begin select book_id from dbo.Books; end`;
        const result = await fmt(sql);
        expect(result).toContain('create or alter procedure');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });

    it('SELECT @var assignment in select list', async () => {
        const result = await fmt('select @total = sum(price) from dbo.Books where in_stock = 1');
        expect(result).toContain('@total');
        expect(result).toMatchSnapshot();
    });
});
