import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import plugin from '../src/plugin/index.js';

// Schema used throughout these tests:
//   Books        (Id, Title, AuthorId, PublisherId, GenreId, Price, InStock, PublishedDate)
//   Authors      (Id, FirstName, LastName, Country, PublisherId)
//   Publishers   (Id, Name, Country)
//   Genres       (Id, Name)
//   Customers    (Id, Name, Email, Active, LastPurchaseDate)
//   Orders       (Id, CustomerId, Total, OrderDate, Status)
//   OrderItems   (Id, OrderId, BookId, Quantity, UnitPrice)
//   ArchivedBooks  (same columns as Books)

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
            'select b.BookId,b.Title,b.Price from Books as b inner join Authors as a on b.AuthorId=a.Id where b.InStock=1 order by b.Title asc'
        );
        expect(result).toMatchSnapshot();
    });

    it('searched CASE with AND condition', async () => {
        const result = await fmt(
            'select case when b.AuthorId is not null and b.GenreId in (1, 2, 3) then 1 else 0 end as IsAvailable from Books as b'
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
from Content`;
        const result = await fmt(sql);
        // Inner case must start on its own line, not on the same line as THEN
        const lines = result.split('\n');
        const thenLines = lines.filter(l => l.trimStart().startsWith('then'));
        expect(thenLines.every(l => !l.includes('case'))).toBe(true);
        expect(result).toMatchSnapshot();
    });

    it('SELECT DISTINCT', async () => {
        const result = await fmt('select distinct GenreId from Books');
        expect(result).toMatchSnapshot();
    });

    it('aggregate with GROUP BY / HAVING', async () => {
        const result = await fmt(
            'select GenreId, count(*) as BookCount, avg(Price) as AvgPrice from Books group by GenreId having count(*) > 5'
        );
        expect(result).toMatchSnapshot();
    });

    it('GROUP BY ROLLUP respects keyword case', async () => {
        const lower = await fmt(
            'SELECT GenreId, AuthorId, SUM(Price) AS Total FROM Books GROUP BY ROLLUP (GenreId, AuthorId)'
        );
        expect(lower).toContain('rollup(');
        expect(lower).toMatchSnapshot();

        const upper = await fmt(
            'SELECT GenreId, AuthorId, SUM(Price) AS Total FROM Books GROUP BY ROLLUP (GenreId, AuthorId)',
            { sqlKeywordCase: 'upper' }
        );
        expect(upper).toContain('ROLLUP(');
    });

    it('GROUP BY CUBE respects keyword case', async () => {
        const result = await fmt(
            'SELECT GenreId, InStock, COUNT(*) AS BookCount FROM Books GROUP BY CUBE (GenreId, InStock)',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('CUBE(');
        expect(result).toMatchSnapshot();
    });

    it('GROUP BY GROUPING SETS with composite groups and grand Total', async () => {
        const lower = await fmt(
            'SELECT GenreId, AuthorId, SUM(Price) AS Total FROM Books GROUP BY GROUPING SETS ((GenreId, AuthorId), (GenreId), ())'
        );
        expect(lower).toContain('grouping sets(');
        expect(lower).toMatchSnapshot();

        const upper = await fmt(
            'SELECT GenreId, AuthorId, SUM(Price) AS Total FROM Books GROUP BY GROUPING SETS ((GenreId, AuthorId), (GenreId), ())',
            { sqlKeywordCase: 'upper' }
        );
        expect(upper).toContain('GROUPING SETS(');
    });

    it('CTE', async () => {
        const result = await fmt(
            'with availableBooks as (select BookId, Title from Books where InStock = 1) select b.Title from availableBooks as b order by b.Title asc'
        );
        expect(result).toMatchSnapshot();
    });

    it('window functions', async () => {
        const result = await fmt(
            'select BookId, Price, row_number() over (partition by GenreId order by Price desc) as rn from Books'
        );
        expect(result).toMatchSnapshot();
    });

    it('subquery in WHERE', async () => {
        const result = await fmt(
            'select BookId, Title from Books where BookId in (select BookId from OrderItems where UnitPrice > 50)'
        );
        expect(result).toMatchSnapshot();
    });

    it('keyword case: lower', async () => {
        const result = await fmt('SELECT BookId FROM Books WHERE InStock = 1', {
            sqlKeywordCase: 'lower',
        });
        expect(result).toContain('select');
        expect(result).toContain('from');
        expect(result).toContain('where');
    });

    it('keyword case: lower (default)', async () => {
        const result = await fmt('select BookId from Books where InStock = 1');
        expect(result).toContain('select');
        expect(result).toContain('from');
        expect(result).toContain('where');
    });
});

describe('INSERT formatting', () => {
    it('VALUES insert', async () => {
        const result = await fmt(
            "insert into Customers (Name, Email, Active) values ('Jane Smith', 'jane@example.com', 1)"
        );
        expect(result).toMatchSnapshot();
    });

    it('INSERT ... SELECT', async () => {
        const result = await fmt(
            'insert into ArchivedBooks (BookId, Title) select BookId, Title from Books where InStock = 0'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('UPDATE formatting', () => {
    it('basic update', async () => {
        const result = await fmt(
            "update Books set Title = 'Updated Title', Price = 29.99 where BookId = 42"
        );
        expect(result).toMatchSnapshot();
    });

    it('update with join', async () => {
        const result = await fmt(
            'update b set b.InStock = 0 from Books as b inner join Publishers as p on b.PublisherId = p.Id where p.Country = \'UK\''
        );
        expect(result).toMatchSnapshot();
    });
});

describe('DELETE formatting', () => {
    it('basic delete', async () => {
        const result = await fmt(
            'delete from Books where InStock = 0 and PublishedDate < dateadd(year, -10, getdate())'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('CREATE TABLE formatting', () => {
    it('basic table', async () => {
        const result = await fmt(
            'create table Books (BookId int not null identity(1,1), Title nvarchar(200) not null, Price decimal(10,2) not null, InStock bit not null default 1, constraint pk_books primary key (BookId))'
        );
        expect(result).toMatchSnapshot();
    });

    it('table with foreign key constraint', async () => {
        const result = await fmt(
            'create table Orders (OrderId int not null identity(1,1), CustomerId int not null, Total decimal(18,2) not null, constraint pk_orders primary key (OrderId), constraint fk_orders_customers foreign key (CustomerId) references Customers (CustomerId))'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('ALTER TABLE formatting', () => {
    it('add column', async () => {
        const result = await fmt('alter table Books add Isbn nvarchar(20) null');
        expect(result).toMatchSnapshot();
    });

    it('drop column', async () => {
        const result = await fmt('alter table Books drop column Isbn');
        expect(result).toMatchSnapshot();
    });
});

describe('CREATE PROCEDURE formatting', () => {
    it('simple procedure', async () => {
        const result = await fmt(
            'create procedure GetAvailableBooks as begin select BookId, Title from Books where InStock = 1 end'
        );
        expect(result).toMatchSnapshot();
    });

    it('procedure with parameters', async () => {
        const result = await fmt(
            'create procedure GetBookById @Id int, @IncludeOutOfStock bit = 0 as begin select BookId, Title from Books where BookId = @Id end'
        );
        expect(result).toMatchSnapshot();
    });

    it('block comment between procedure Name and first parameter is preserved', async () => {
        const result = await fmt(
            'create procedure GetBookById\n' +
            '/**********************\n' +
            '** Author: Jon\n' +
            '** Date:   2012-01-10\n' +
            '**********************/\n' +
            '@Id int, @IncludeOutOfStock bit = 0\n' +
            'as begin select BookId from Books where BookId = @Id end'
        );
        expect(result).toContain('**********************');
        expect(result).toContain('Author: Jon');
        expect(result).toMatchSnapshot();
    });

    it('line comment inside procedure body is preserved', async () => {
        const result = await fmt(
            'create procedure GetAvailableBooks as begin\n' +
            '-- fetch available books only\n' +
            'select BookId, Title from Books where InStock = 1 end'
        );
        expect(result).toContain('-- fetch available books only');
        expect(result).toMatchSnapshot();
    });

    it('block comment after last parameter (before AS) stays between params and as', async () => {
        const result = await fmt(
            'create procedure GetBookById\n' +
            '@Id int,\n' +
            '@Active bit\n' +
            '/*WITH ENCRYPTION*/\n' +
            'as begin select BookId from Books where BookId = @Id end'
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
            'select BookId from Books;\n/* end of queries */'
        );
        expect(result).toContain('/* end of queries */');
        expect(result).toMatchSnapshot();
    });

    it('line comment after last statement in file is not lost', async () => {
        const result = await fmt(
            'select BookId from Books;\n-- end of queries'
        );
        expect(result).toContain('-- end of queries');
        expect(result).toMatchSnapshot();
    });

    it('commented-out predicate in WHERE is preserved between surrounding predicates', async () => {
        const result = await fmt(
            ['select Id from Books', 'where InStock = 1', '-- and Price < 20', 'and GenreId = 1'].join('\n')
        );
        expect(result).toContain('-- and Price < 20');
        const lines = result.split('\n');
        const commentIdx = lines.findIndex(l => l.includes('-- and Price < 20'));
        const inStockIdx = lines.findIndex(l => l.includes('InStock = 1'));
        const genreIdx = lines.findIndex(l => l.includes('GenreId = 1'));
        expect(commentIdx).toBeGreaterThan(inStockIdx);
        expect(commentIdx).toBeLessThan(genreIdx);
        expect(result).toMatchSnapshot();
    });
});

describe('comma style option', () => {
    it('trailing commas (default)', async () => {
        const result = await fmt('select BookId, Title, Price from Books');
        expect(result).toMatchSnapshot();
    });
});

describe('density option', () => {
    const multiJoinSql =
        'select b.BookId, b.Title from Books as b inner join Authors as a on b.AuthorId = a.Id where b.InStock = 1 order by b.Title asc';
    const multiWhereSql =
        'select BookId from Books where InStock = 1 and Price < 100';
    const multiOnSql =
        'select b.BookId from Books as b inner join Authors as a on b.AuthorId = a.Id and b.PublisherId = a.PublisherId';

    describe('compact', () => {
        it('single-line query stays inline', async () => {
            const result = await fmt('select BookId from Books where InStock = 1', {
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
            const result = await fmt('select BookId from Books where InStock = 1', {
                sqlDensity: 'standard',
            });
            expect(result).toContain('where InStock = 1');
        });

        it('multiple WHERE predicates each on own line', async () => {
            const result = await fmt(multiWhereSql, { sqlDensity: 'standard' });
            expect(result).toContain('and Price');
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
            expect(result).toContain('order by b.Title asc');
        });
    });

    describe('spacious', () => {
        it('single WHERE predicate on own line', async () => {
            const result = await fmt('select BookId from Books where InStock = 1', {
                sqlDensity: 'spacious',
            });
            expect(result).not.toContain('where InStock');
            expect(result).toMatchSnapshot();
        });

        it('single ON predicate on own line', async () => {
            const result = await fmt(multiJoinSql, { sqlDensity: 'spacious' });
            expect(result).not.toContain('on b.AuthorId');
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
            'create or alter view AvailableBooksView as select BookId, Title from Books where InStock = 1',
            { sqlKeywordCase: 'lower' }
        );
        expect(result).toMatchSnapshot();
    });

    it('block comment between view Name and AS is preserved in place', async () => {
        // A block comment between the view Name and AS must stay there.
        const sql = [
            'create or alter view [dbo].[ExampleView]',
            '/* with encryption */',
            'as',
            'select BookId from Books;',
        ].join('\n');
        const result = await fmt(sql, { sqlKeywordCase: 'lower' });
        // Comment must appear after the view Name, not before the create keyword
        expect(result).not.toMatch(/^\/\*/);
        const createIdx = result.indexOf('create or alter view');
        const commentIdx = result.indexOf('/* with encryption */');
        expect(commentIdx).toBeGreaterThan(createIdx);
        expect(result).toMatchSnapshot();
    });

    it('block comment inside first view does not appear before second view', async () => {
        // A block comment internal to one batch must not bleed into the next batch.
        const sql = [
            'create or alter view BooksView',
            '/* with encryption */',
            'as',
            'select 1 as x;',
            'go',
            'create or alter view AuthorsView',
            'as',
            'select 2 as y;',
        ].join('\n');
        const result = await fmt(sql, { sqlKeywordCase: 'lower' });
        const secondViewIdx = result.indexOf('create or alter view AuthorsView');
        const commentIdx = result.indexOf('/* with encryption */');
        expect(commentIdx).toBeLessThan(secondViewIdx);
        expect(result).toMatchSnapshot();
    });

    it('leading comment before CREATE VIEW attaches correctly', async () => {
        // A standalone comment on its own line before CREATE VIEW should be kept.
        const sql = [
            '-- view description',
            'create or alter view TestBooksView as select 1 as x;',
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
        const result = await fmt('select BookId from Books as b with (nolock)');
        expect(result).toContain('with (nolock)');
        expect(result).toMatchSnapshot();
    });

    it('multiple hints', async () => {
        const result = await fmt('select BookId from Books with (nolock, rowlock)');
        expect(result).toContain('with (nolock, rowlock)');
        expect(result).toMatchSnapshot();
    });

    it('NOLOCK on joined table', async () => {
        const result = await fmt(
            'select b.BookId, p.Name from Books as b with (nolock) inner join Publishers as p with (nolock) on b.PublisherId = p.Id'
        );
        expect(result).toContain('with (nolock)');
        expect(result).toMatchSnapshot();
    });

    it('hints respect keyword case upper', async () => {
        const result = await fmt('select BookId from Books with (nolock)', { sqlKeywordCase: 'upper' });
        expect(result).toContain('WITH (NOLOCK)');
        expect(result).toMatchSnapshot();
    });
});

describe('nested join formatting', () => {
    it('parenthesized nested join', async () => {
        const result = await fmt(
            'select b.Title from Books as b left join (Authors as a inner join Publishers as p on a.PublisherId = p.Id) on b.AuthorId = a.Id'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('IN clause formatting', () => {
    it('short value list stays on one line', async () => {
        const result = await fmt('select BookId from Books where GenreId in (1, 2, 3)');
        expect(result).toContain('in (1, 2, 3)');
        expect(result).toMatchSnapshot();
    });

    it('long value list wraps each value to its own line', async () => {
        const result = await fmt(
            "select AuthorId from Authors where Country in ('United States', 'United Kingdom', 'Canada', 'Australia', 'Germany')"
        );
        const lines = result.split('\n');
        // ) should be on its own line (not sharing a line with the last value)
        const closingLine = lines.find((l) => l.trimStart().startsWith(')'));
        expect(closingLine).toBeDefined();
        expect(result).toMatchSnapshot();
    });

    it('NOT IN short list stays inline', async () => {
        const result = await fmt('select BookId from Books where GenreId not in (1, 2)');
        expect(result).toContain('not in (1, 2)');
        expect(result).toMatchSnapshot();
    });

    it('IN subquery is unaffected', async () => {
        const result = await fmt(
            'select BookId from Books where BookId in (select BookId from OrderItems where UnitPrice > 50)'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('intra-WHERE comments', () => {
    it('commented-out predicates are preserved between Active predicates', async () => {
        const sql = [
            'select BookId from Books',
            'where 1 = 1',
            '    and Books.GenreId in (1)',
            "    --and Books.GenreId in (select GenreId from Genres where Name = 'Fiction')",
            '    and Books.PublisherId in (4)',
            '    --and Books.PublisherId in (select PublisherId from Publishers where Country = \'UK\')',
            '    and Books.AuthorId in (101, 102)',
        ].join('\n');
        const result = await fmt(sql);
        // Both commented-out predicates must appear in output
        expect(result).toContain('--and Books.GenreId');
        expect(result).toContain('--and Books.PublisherId');
        // They must appear between their neighbouring Active predicates
        const lines = result.split('\n');
        const idxGenreActive   = lines.findIndex(l => l.includes('GenreId in (1)'));
        const idxGenreComment  = lines.findIndex(l => l.includes('--and Books.GenreId'));
        const idxPubActive     = lines.findIndex(l => l.includes('PublisherId in (4)'));
        const idxPubComment    = lines.findIndex(l => l.includes('--and Books.PublisherId'));
        expect(idxGenreComment).toBeGreaterThan(idxGenreActive);
        expect(idxPubActive).toBeGreaterThan(idxGenreComment);
        expect(idxPubComment).toBeGreaterThan(idxPubActive);
        expect(result).toMatchSnapshot();
    });
});

describe('UNION / INTERSECT / EXCEPT formatting', () => {
    it('UNION ALL has blank lines before and after the operator', async () => {
        const result = await fmt(
            'select BookId, Title from Books where InStock = 1 union all select BookId, Title from ArchivedBooks'
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
            'select AuthorId from Books union select AuthorId from ArchivedBooks'
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
            'select BookId, Title from Books where InStock = 1 option (recompile)'
        );
        expect(result).toContain('option (recompile)');
        expect(result).toMatchSnapshot();
    });

    it('OPTION clause respects keyword case upper', async () => {
        const result = await fmt(
            'select BookId from Books option (recompile)',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('OPTION');
        expect(result).toMatchSnapshot();
    });

    it('OPTION clause with ORDER BY appears after ORDER BY', async () => {
        const result = await fmt(
            'select BookId, Title from Books where InStock = 1 order by Title asc option (recompile)'
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
select b.BookId, b.Title
from Books as b
inner join Authors as a on b.AuthorId = a.Id
-- left join: publishers may not exist for all books
left join Publishers as p on b.PublisherId = p.Id`;
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
select b.BookId from Books as b
inner join Authors as a on b.AuthorId = a.Id
-- optional: genre
left join Genres as g on b.GenreId = g.Id
-- optional: publisher
left join Publishers as p on b.PublisherId = p.Id`;
        const result = await fmt(sql);
        expect(result).toContain('-- optional: genre');
        expect(result).toContain('-- optional: publisher');
        expect(result).toMatchSnapshot();
    });
});

describe('derived table (subquery in FROM)', () => {
    it('simple derived table with alias', async () => {
        const result = await fmt(
            'select b.Title, b.Price from (select Title, Price from Books where InStock = 1) as b'
        );
        expect(result).toMatchSnapshot();
    });

    it('derived table joined to another table', async () => {
        const result = await fmt(
            'select b.Title, a.LastName from (select BookId, Title, AuthorId from Books where Price > 20) as b inner join Authors as a on b.AuthorId = a.Id'
        );
        expect(result).toMatchSnapshot();
    });
});

describe('expression functions', () => {
    it('CAST preserves length', async () => {
        const result = await fmt("select cast(Title as nvarchar(100)) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NVARCHAR(100)');
        expect(result).toMatchSnapshot();
    });

    it('CONVERT preserves length and style', async () => {
        const result = await fmt("select convert(nvarchar(50), Price, 1) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NVARCHAR(50)');
        expect(result).toMatchSnapshot();
    });

    it('IIF expression', async () => {
        const result = await fmt("select iif(InStock = 1, 'yes', 'no') from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('IIF(');
        expect(result).toMatchSnapshot();
    });

    it('COALESCE expression', async () => {
        const result = await fmt("select coalesce(Price, 0.0) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('COALESCE(');
        expect(result).toMatchSnapshot();
    });

    it('NULLIF expression', async () => {
        const result = await fmt("select nullif(Price, 0) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('NULLIF(');
        expect(result).toMatchSnapshot();
    });

    it('TRY_CAST expression', async () => {
        const result = await fmt("select try_cast(Title as int) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('TRY_CAST(');
        expect(result).toMatchSnapshot();
    });

    it('TRY_CONVERT expression', async () => {
        const result = await fmt("select try_convert(decimal(10,2), Price) from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('TRY_CONVERT(');
        expect(result).toMatchSnapshot();
    });

    it('AT TIME ZONE expression', async () => {
        const result = await fmt("select getdate() at time zone 'UTC' from Books", { sqlKeywordCase: 'upper' });
        expect(result).toContain('AT TIME ZONE');
        expect(result).toMatchSnapshot();
    });

    it('TVF in FROM clause', async () => {
        const result = await fmt("select * from GetBooks(1) as b");
        expect(result).toContain('GetBooks(');
        expect(result).toMatchSnapshot();
    });

    it('short string concatenation stays on one line', async () => {
        const result = await fmt("select isnull(LastName, '') + ', ' + isnull(FirstName, '') as FullName from Authors");
        expect(result).toMatchSnapshot();
    });

    it('long string concatenation breaks before + not inside function args', async () => {
        const sql = "select isnull(VID.LastNm, '') + ', ' + isnull(VID.FirstNm, '') + ' ' + isnull(VID.MiddleNm, '') + ' ' + isnull(S.Suffix, '') as VisitorNm from Visitors as VID inner join Suffixes as S on VID.SuffixId = S.SuffixId";
        const result = await fmt(sql);
        // breaks at + operators, never inside a function call's args
        expect(result).not.toMatch(/isnull\(\s*\n/);
        expect(result).toMatchSnapshot();
    });
});

describe('Control flow & DDL additions', () => {
    it('TRUNCATE TABLE', async () => {
        const result = await fmt('truncate table Books');
        expect(result).toMatchInlineSnapshot(`"truncate table Books;"`);
    });

    it('TRUNCATE TABLE uppercase', async () => {
        const result = await fmt('TRUNCATE TABLE Books', { sqlKeywordCase: 'upper' });
        expect(result).toMatchInlineSnapshot(`"TRUNCATE TABLE Books;"`);
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
  select BookId from Books;
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
        const result = await fmt('drop table Books');
        expect(result).toMatchInlineSnapshot(`"drop table Books;"`);
    });

    it('DROP TABLE IF EXISTS', async () => {
        const result = await fmt('drop table if exists Books');
        expect(result).toMatchInlineSnapshot(`"drop table if exists Books;"`);
    });

    it('DROP PROCEDURE', async () => {
        const result = await fmt('drop procedure GetBooks');
        expect(result).toMatchInlineSnapshot(`"drop procedure GetBooks;"`);
    });

    it('DROP VIEW', async () => {
        const result = await fmt('drop view AvailableBooksView');
        expect(result).toMatchInlineSnapshot(`"drop view AvailableBooksView;"`);
    });

    it('DROP FUNCTION', async () => {
        const result = await fmt('drop function GetBookPrice');
        expect(result).toMatchInlineSnapshot(`"drop function GetBookPrice;"`);
    });

    it('DROP INDEX', async () => {
        const result = await fmt('drop index ix_title on Books');
        expect(result).toMatchInlineSnapshot(`"drop index ix_title on Books;"`);
    });

    it('CREATE OR ALTER PROCEDURE emits correct keyword and GO', async () => {
        const sql = `create or alter procedure GetBooks as begin select BookId from Books; end`;
        const result = await fmt(sql);
        expect(result).toContain('create or alter procedure');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });

    it('SELECT @var assignment in select list', async () => {
        const result = await fmt('select @total = sum(Price) from Books where InStock = 1');
        expect(result).toContain('@total');
        expect(result).toMatchSnapshot();
    });
});

describe('MERGE statement', () => {
    it('full MERGE with all three clause types', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s
            on t.BookId = s.BookId
            when matched then
                update set t.Title = s.Title, t.Price = s.Price
            when not matched by target then
                insert (BookId, Title, Price) values (s.BookId, s.Title, s.Price)
            when not matched by source then
                delete;
        `);
        expect(result).toContain('merge into');
        expect(result).toContain('using');
        expect(result).toContain('when matched then');
        expect(result).toContain('update set');
        expect(result).toContain('when not matched by target then');
        expect(result).toContain('insert');
        expect(result).toContain('when not matched by source then');
        expect(result).toContain('delete');
        expect(result).toMatchSnapshot();
    });

    it('MERGE with AND predicate on WHEN MATCHED', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s
            on t.BookId = s.BookId
            when matched and t.Price <> s.Price then
                update set t.Price = s.Price;
        `);
        expect(result).toContain('when matched and');
        expect(result).toContain('update set');
        expect(result).toMatchSnapshot();
    });

    it('MERGE with multi-predicate ON breaks predicates below USING line', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s
            on t.BookId = s.BookId and t.Name = s.Name
            when matched then
                update set t.Price = s.Price;
        `);
        expect(result).toMatchInlineSnapshot(`
"merge into Books as t
using ArchivedBooks as s on
  t.BookId = s.BookId
  and t.Name = s.Name
when matched then
  update set
    t.Price = s.Price;"
        `);
    });

    it('MERGE respects sqlKeywordCase upper', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s
            on t.BookId = s.BookId
            when matched then
                update set t.Price = s.Price;
        `, { sqlKeywordCase: 'upper' });
        expect(result).toContain('MERGE INTO');
        expect(result).toContain('WHEN MATCHED THEN');
        expect(result).toContain('UPDATE SET');
    });

    it('MERGE with subquery as source', async () => {
        const result = await fmt(`
            merge into Books as t
            using (select BookId, Title, Price from ArchivedBooks where Price > 0) as s
            on t.BookId = s.BookId
            when matched then
                update set t.Title = s.Title, t.Price = s.Price;
        `);
        expect(result).toContain('using');
        expect(result).toContain('select');
        expect(result).toContain('when matched then');
        expect(result).toMatchSnapshot();
    });
});

describe('OUTPUT clause', () => {
    it('MERGE with OUTPUT $action and inserted/deleted columns', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s on t.BookId = s.BookId
            when matched then update set t.Price = s.Price
            when not matched by target then insert (BookId, Title, Price) values (s.BookId, s.Title, s.Price)
            when not matched by source then delete
            output $action, inserted.BookId, deleted.Price;
        `);
        expect(result).toContain('output');
        expect(result).toContain('$action');
        expect(result).toContain('inserted.BookId');
        expect(result).toContain('deleted.Price');
        expect(result).toMatchSnapshot();
    });

    it('MERGE with OUTPUT INTO table variable', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s on t.BookId = s.BookId
            when matched then update set t.Price = s.Price
            output $action, inserted.BookId, inserted.Price
            into @changes (action, BookId, Price);
        `);
        expect(result).toContain('output');
        expect(result).toContain('into @changes');
        expect(result).toMatchSnapshot();
    });

    it('INSERT with OUTPUT inserted.*', async () => {
        const result = await fmt(
            'insert into Books (Title, Price) output inserted.BookId, inserted.Title values (\'New Book\', 9.99)'
        );
        expect(result).toContain('output');
        expect(result).toContain('inserted.BookId');
        expect(result).toMatchSnapshot();
    });

    it('DELETE with OUTPUT INTO', async () => {
        const result = await fmt(`
            delete from Books
            output deleted.BookId, deleted.Title into @removed (BookId, Title)
            where InStock = 0
        `);
        expect(result).toContain('output');
        expect(result).toContain('into @removed');
        expect(result).toMatchSnapshot();
    });

    it('UPDATE with OUTPUT', async () => {
        const result = await fmt(
            'update Books set Price = Price * 1.1 output inserted.BookId, deleted.Price, inserted.Price where InStock = 1'
        );
        expect(result).toContain('output');
        expect(result).toContain('deleted.Price');
        expect(result).toMatchSnapshot();
    });

    it('OUTPUT respects keyword casing upper', async () => {
        const result = await fmt(`
            merge into Books as t
            using ArchivedBooks as s on t.BookId = s.BookId
            when matched then update set t.Price = s.Price
            output $action, inserted.BookId;
        `, { sqlKeywordCase: 'upper' });
        expect(result).toContain('OUTPUT');
        expect(result).toContain('MERGE INTO');
    });
});

describe('Full-text predicates', () => {
    it('CONTAINS with single column', async () => {
        const result = await fmt(
            "select BookId, Title from Books where contains(Title, '\"SQL Server\"')"
        );
        expect(result).toContain('contains(');
        expect(result).toContain('Title');
        expect(result).toMatchSnapshot();
    });

    it('FREETEXT with single column', async () => {
        const result = await fmt(
            "select BookId, Title from Books where freetext(Title, 'database programming')"
        );
        expect(result).toContain('freetext(');
        expect(result).toMatchSnapshot();
    });

    it('CONTAINS with wildcard *', async () => {
        const result = await fmt(
            "select BookId from Books where contains(*, 'programming')"
        );
        expect(result).toContain('contains(*, ');
        expect(result).toMatchSnapshot();
    });

    it('CONTAINS with multiple columns', async () => {
        const result = await fmt(
            "select BookId from Books where contains((Title, AuthorId), 'design')"
        );
        expect(result).toContain('contains((Title, AuthorId)');
        expect(result).toMatchSnapshot();
    });

    it('CONTAINS with LANGUAGE', async () => {
        const result = await fmt(
            "select BookId from Books where contains(Title, 'query', language 1033)"
        );
        expect(result).toContain('language');
        expect(result).toContain('1033');
        expect(result).toMatchSnapshot();
    });

    it('CONTAINSTABLE in FROM clause', async () => {
        const result = await fmt(
            "select b.BookId, b.Title, ft.[rank] from Books as b inner join containstable(Books, Title, '\"SQL\"') as ft on b.BookId = ft.[key]"
        );
        expect(result).toContain('containstable(');
        expect(result).toContain('Books');
        expect(result).toMatchSnapshot();
    });

    it('FREETEXTTABLE with wildcard and TOP N', async () => {
        const result = await fmt(
            "select b.BookId, ft.[rank] from Books as b inner join freetexttable(Books, *, 'programming', 10) as ft on b.BookId = ft.[key]"
        );
        expect(result).toContain('freetexttable(');
        expect(result).toMatchSnapshot();
    });

    it('full-text keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            "select BookId from Books where contains(Title, 'SQL')",
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('CONTAINS(');
        expect(result).toContain('FROM');
        expect(result).toContain('WHERE');
    });
});

describe('Rowset functions', () => {
    it('OPENJSON without WITH clause', async () => {
        const result = await fmt(
            "select j.[key], j.[value] from Orders as o cross apply openjson(o.JsonData) as j where o.id = 1;"
        );
        expect(result).toMatchInlineSnapshot(`
"select
  j.key,
  j.value
from
  Orders as o
  cross apply openjson(o.JsonData) as j
where o.id = 1;"
        `);
    });

    it('OPENJSON with row path and WITH clause', async () => {
        const result = await fmt(
            "select j.OrderId, j.amount from Orders as o cross apply openjson(o.JsonData, '$.items') with (OrderId int '$.id', amount decimal(10,2) '$.amount', notes nvarchar(500) '$.notes') as j;"
        );
        expect(result).toMatchInlineSnapshot(`
          "select
            j.OrderId,
            j.amount
          from
            Orders as o
            cross apply openjson(o.JsonData, '$.items') with (
              OrderId int '$.id',
              amount decimal(10,2) '$.amount',
              notes nvarchar(500) '$.notes'
            ) as j;"
        `);
    });

    it('OPENJSON WITH clause with AS JSON column', async () => {
        const result = await fmt(
            "select j.id, j.data from openjson(@json) with (id int '$.id', data nvarchar(max) '$.data' as json) as j;"
        );
        expect(result).toContain("data nvarchar(max) '$.data' as json");
        expect(result).toContain('openjson(@json)');
    });

    it('OPENXML with WITH schema declaration', async () => {
        const result = await fmt(
            "select x.id, x.Name from openxml(@hDoc, '/root/item', 2) with (id int '@id', Name varchar(100) 'Name') as x;"
        );
        expect(result).toMatchInlineSnapshot(`
          "select
            x.id,
            x.Name
          from openxml(@hDoc, '/root/item', 2) with (
            id int '@id',
            Name varchar(100) 'Name'
          ) as x;"
        `);
    });

    it('rowset function keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            "select j.id from openjson(@json) with (id int '$.id') as j;",
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('OPENJSON(');
        expect(result).toContain('WITH (');
        expect(result).toContain('AS j');
    });

    it('OPENROWSET provider form with provider string and query', async () => {
        const result = await fmt(
            "select r.id, r.Name from openrowset('SQLNCLI', 'Server=(local);Trusted_Connection=yes;', 'select id, Name from pubs.titles') as r;"
        );
        expect(result).toMatchInlineSnapshot(`
          "select
            r.id,
            r.Name
          from openrowset(
            'SQLNCLI',
            'Server=(local);Trusted_Connection=yes;',
            'select id, Name from pubs.titles'
          ) as r;"
        `);
    });

    it('OPENROWSET provider form with datasource/userid/password and schema object', async () => {
        const result = await fmt(
            "select * from openrowset('SQLNCLI', 'server=(local)';'sa';'pass', pubs.titles) as r;"
        );
        expect(result).toContain("openrowset('SQLNCLI', 'server=(local)';'sa';'pass', pubs.titles)");
        expect(result).toContain('as r;');
    });

    it('OPENROWSET BULK form with FORMATFILE and options', async () => {
        const result = await fmt(
            "select * from openrowset(bulk 'C:\\data\\file.csv', formatfile='C:\\data\\fmt.xml', firstrow=2) as t;"
        );
        expect(result).toContain("bulk 'C:\\data\\file.csv',");
        expect(result).toContain("formatfile='C:\\data\\fmt.xml'");
        expect(result).toContain('as t;');
    });

    it('OPENROWSET BULK form SINGLE_BLOB', async () => {
        const result = await fmt(
            "select * from openrowset(bulk 'C:\\data\\data.json', single_blob) as j;"
        );
        expect(result).toContain("openrowset(bulk 'C:\\data\\data.json',");
        expect(result).toContain('single_blob)');
        expect(result).toContain('as j;');
    });

    it('OPENROWSET keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            "select r.id from openrowset('SQLNCLI', 'Server=(local);Trusted_Connection=yes;', 'select 1') as r;",
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('OPENROWSET(');
        expect(result).toContain('AS r');
    });

    it('OPENROWSET BULK keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            "select * from openrowset(bulk 'C:\\data\\file.csv', single_blob) as t;",
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('OPENROWSET(BULK ');
        expect(result).toContain('AS t');
    });
});

describe('Database administration', () => {
    // DROP DATABASE
    it('DROP DATABASE single', async () => {
        expect(await fmt('DROP DATABASE OldDb')).toBe('drop database OldDb;');
    });

    it('DROP DATABASE IF EXISTS', async () => {
        expect(await fmt('DROP DATABASE IF EXISTS OldDb')).toBe('drop database if exists OldDb;');
    });

    it('DROP DATABASE multiple', async () => {
        expect(await fmt('DROP DATABASE Db1, Db2')).toBe('drop database Db1, Db2;');
    });

    // DBCC
    it('DBCC no arguments', async () => {
        expect(await fmt('DBCC FREEPROCCACHE')).toBe('dbcc freeproccache;');
    });

    it('DBCC with literal argument', async () => {
        expect(await fmt("DBCC CHECKDB ('AdventureWorks')")).toBe("dbcc checkdb('AdventureWorks');");
    });

    it('DBCC with WITH options', async () => {
        expect(await fmt("DBCC CHECKDB ('AdventureWorks') WITH NO_INFOMSGS")).toContain('with NO_INFOMSGS');
    });

    it('DBCC multiple literals', async () => {
        expect(await fmt('DBCC SHRINKFILE (1, 10)')).toBe('dbcc shrinkfile(1, 10);');
    });

    it('DBCC keywords respect sqlKeywordCase upper', async () => {
        const r = await fmt('DBCC FREEPROCCACHE', { sqlKeywordCase: 'upper' });
        expect(r).toBe('DBCC FREEPROCCACHE;');
    });

    // BACKUP
    it('BACKUP DATABASE simple', async () => {
        const r = await fmt("BACKUP DATABASE AdventureWorks TO DISK = N'C:\\backup\\AW.bak'");
        expect(r).toMatchInlineSnapshot(`
          "backup database AdventureWorks
            to DISK = N'C:\\backup\\AW.bak';"
        `);
    });

    it('BACKUP DATABASE with options', async () => {
        const r = await fmt("BACKUP DATABASE AdventureWorks TO DISK = N'C:\\backup\\AW.bak' WITH COMPRESSION, STATS = 10");
        expect(r).toContain('backup database AdventureWorks');
        expect(r).toContain("to DISK = N'C:\\backup\\AW.bak'");
        expect(r).toContain('with COMPRESSION, STATS = 10');
    });

    it('BACKUP LOG', async () => {
        const r = await fmt("BACKUP LOG AdventureWorks TO DISK = N'C:\\backup\\AW_log.bak'");
        expect(r).toContain('backup log AdventureWorks');
        expect(r).toContain("to DISK = N'C:\\backup\\AW_log.bak'");
    });

    it('BACKUP keywords respect sqlKeywordCase upper', async () => {
        const r = await fmt("BACKUP DATABASE AdventureWorks TO DISK = N'C:\\bk.bak'", { sqlKeywordCase: 'upper' });
        expect(r).toContain('BACKUP DATABASE');
        expect(r).toContain('TO ');
    });

    // RESTORE
    it('RESTORE DATABASE simple', async () => {
        const r = await fmt("RESTORE DATABASE AdventureWorks FROM DISK = N'C:\\backup\\AW.bak'");
        expect(r).toMatchInlineSnapshot(`
          "restore database AdventureWorks
            from DISK = N'C:\\backup\\AW.bak';"
        `);
    });

    it('RESTORE DATABASE with options', async () => {
        const r = await fmt("RESTORE DATABASE AdventureWorks FROM DISK = N'C:\\backup\\AW.bak' WITH NORECOVERY");
        expect(r).toContain('restore database AdventureWorks');
        expect(r).toContain('with NORECOVERY');
    });

    it('RESTORE LOG', async () => {
        const r = await fmt("RESTORE LOG AdventureWorks FROM DISK = N'C:\\backup\\AW_log.bak' WITH RECOVERY");
        expect(r).toContain('restore log AdventureWorks');
    });

    it('RESTORE keywords respect sqlKeywordCase upper', async () => {
        const r = await fmt("RESTORE DATABASE Db FROM DISK = N'C:\\bk.bak'", { sqlKeywordCase: 'upper' });
        expect(r).toContain('RESTORE DATABASE');
        expect(r).toContain('FROM ');
    });

    // CREATE DATABASE
    it('CREATE DATABASE minimal', async () => {
        expect(await fmt('CREATE DATABASE NewDb')).toBe('create database NewDb;');
    });

    it('CREATE DATABASE with COLLATE', async () => {
        expect(await fmt('CREATE DATABASE NewDb COLLATE Latin1_General_CI_AS')).toBe(
            'create database NewDb collate Latin1_General_CI_AS;'
        );
    });

    it('CREATE DATABASE keywords respect sqlKeywordCase upper', async () => {
        const r = await fmt('CREATE DATABASE NewDb', { sqlKeywordCase: 'upper' });
        expect(r).toBe('CREATE DATABASE NewDb;');
    });

    // ALTER DATABASE SET
    it('ALTER DATABASE SET', async () => {
        const r = await fmt('ALTER DATABASE AdventureWorks SET RECOVERY FULL');
        expect(r).toMatchInlineSnapshot(`
          "alter database AdventureWorks
          set recovery full;"
        `);
    });

    it('ALTER DATABASE SET with termination', async () => {
        const r = await fmt('ALTER DATABASE AdventureWorks SET AUTO_CLOSE ON WITH NO_WAIT');
        expect(r).toContain('set auto_close on with no_wait');
    });

    it('ALTER DATABASE SET CURRENT', async () => {
        const r = await fmt('ALTER DATABASE CURRENT SET QUERY_STORE = ON');
        expect(r).toContain('alter database current');
        expect(r).toContain('query_store');
    });

    // ALTER DATABASE COLLATE
    it('ALTER DATABASE COLLATE', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks COLLATE Latin1_General_CI_AS')).toBe(
            'alter database AdventureWorks collate Latin1_General_CI_AS;'
        );
    });

    // ALTER DATABASE MODIFY NAME
    it('ALTER DATABASE MODIFY NAME', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks MODIFY NAME = AdventureWorks2')).toBe(
            'alter database AdventureWorks modify name = AdventureWorks2;'
        );
    });

    // ALTER DATABASE SCOPED CONFIGURATION
    it('ALTER DATABASE SCOPED CONFIGURATION SET', async () => {
        expect(await fmt('ALTER DATABASE SCOPED CONFIGURATION SET MAXDOP = 4')).toBe(
            'alter database scoped configuration set maxdop = 4;'
        );
    });

    it('ALTER DATABASE SCOPED CONFIGURATION CLEAR', async () => {
        expect(await fmt('ALTER DATABASE SCOPED CONFIGURATION CLEAR PROCEDURE_CACHE')).toBe(
            'alter database scoped configuration clear procedure_cache;'
        );
    });

    it('ALTER DATABASE SCOPED CONFIGURATION keywords respect upper', async () => {
        const r = await fmt('ALTER DATABASE SCOPED CONFIGURATION SET MAXDOP = 4', { sqlKeywordCase: 'upper' });
        expect(r).toContain('ALTER DATABASE SCOPED CONFIGURATION');
        expect(r).toContain('SET ');
        expect(r).toContain('MAXDOP = 4');
    });

    // ALTER DATABASE file operations
    it('ALTER DATABASE ADD FILEGROUP', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks ADD FILEGROUP FG2')).toBe(
            'alter database AdventureWorks add filegroup FG2;'
        );
    });

    it('ALTER DATABASE REMOVE FILEGROUP', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks REMOVE FILEGROUP FG2')).toBe(
            'alter database AdventureWorks remove filegroup FG2;'
        );
    });

    it('ALTER DATABASE REMOVE FILE', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks REMOVE FILE AW_Data2')).toBe(
            'alter database AdventureWorks remove file AW_Data2;'
        );
    });

    it('ALTER DATABASE MODIFY FILEGROUP', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks MODIFY FILEGROUP FG2 READONLY')).toBe(
            'alter database AdventureWorks modify filegroup FG2 readonly;'
        );
    });

    it('ALTER DATABASE MODIFY FILEGROUP DEFAULT', async () => {
        expect(await fmt('ALTER DATABASE AdventureWorks MODIFY FILEGROUP FG2 DEFAULT')).toBe(
            'alter database AdventureWorks modify filegroup FG2 default;'
        );
    });

    it('ALTER DATABASE MODIFY FILE', async () => {
        const r = await fmt("ALTER DATABASE AdventureWorks MODIFY FILE (NAME = AW_Data, SIZE = 100MB)");
        expect(r).toContain('modify file');
        expect(r).toContain('name = AW_Data');
        expect(r).toContain('size = 100mb');
    });

    it('ALTER DATABASE ADD FILE', async () => {
        const r = await fmt("ALTER DATABASE AdventureWorks ADD FILE (NAME = N'AW_Data2', FILENAME = N'C:\\data\\AW2.ndf')");
        expect(r).toContain('add file');
        expect(r).toContain("name = N'AW_Data2'");
        expect(r).toContain("filename = N'C:\\data\\AW2.ndf'");
    });

    it('ALTER DATABASE REBUILD LOG without ON clause', async () => {
        const r = await fmt('ALTER DATABASE AdventureWorks REBUILD LOG');
        expect(r).toBe('alter database AdventureWorks rebuild log;');
    });

    it('ALTER DATABASE REBUILD LOG with ON clause', async () => {
        const r = await fmt("ALTER DATABASE AdventureWorks REBUILD LOG ON (NAME = AW_log, FILENAME = N'C:\\data\\AW.ldf')");
        expect(r).toContain('rebuild log');
        expect(r).toContain('on (');
        expect(r).toContain('name = AW_log');
    });

    it('ALTER DATABASE keywords respect sqlKeywordCase upper', async () => {
        const r = await fmt('ALTER DATABASE AdventureWorks SET RECOVERY FULL', { sqlKeywordCase: 'upper' });
        expect(r).toContain('ALTER DATABASE');
        expect(r).toContain('SET ');
    });
});

describe('USE / SET / WAITFOR / ALTER PROC/FUNC', () => {
    it('USE statement', async () => {
        expect(await fmt('USE AdventureWorks2019')).toContain('use AdventureWorks2019;');
    });

    it('USE respects keyword casing', async () => {
        expect(await fmt('USE AdventureWorks2019', { sqlKeywordCase: 'upper' })).toContain('USE AdventureWorks2019;');
    });

    it('SET NOCOUNT ON', async () => {
        expect(await fmt('SET NOCOUNT ON')).toContain('set nocount on;');
    });

    it('SET QUOTED_IDENTIFIER OFF', async () => {
        expect(await fmt('SET QUOTED_IDENTIFIER OFF')).toContain('set quoted_identifier off;');
    });

    it('SET ANSI_NULLS ON', async () => {
        expect(await fmt('SET ANSI_NULLS ON')).toContain('set ansi_nulls on;');
    });

    it('SET IDENTITY_INSERT table ON', async () => {
        expect(await fmt('SET IDENTITY_INSERT Books ON')).toContain('set identity_insert Books on;');
    });

    it('SET TRANSACTION ISOLATION LEVEL READ COMMITTED', async () => {
        expect(await fmt('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'))
            .toContain('set transaction isolation level read committed;');
    });

    it('SET TRANSACTION ISOLATION LEVEL SNAPSHOT', async () => {
        expect(await fmt('SET TRANSACTION ISOLATION LEVEL SNAPSHOT'))
            .toContain('set transaction isolation level snapshot;');
    });

    it('SET STATISTICS IO ON', async () => {
        expect(await fmt('SET STATISTICS IO ON')).toContain('set statistics io on;');
    });

    it('WAITFOR DELAY', async () => {
        expect(await fmt("WAITFOR DELAY '00:00:05'")).toContain("waitfor delay '00:00:05';");
    });

    it('WAITFOR TIME', async () => {
        expect(await fmt("WAITFOR TIME '10:00:00'")).toContain("waitfor time '10:00:00';");
    });

    it('SET keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt('SET NOCOUNT ON; SET ANSI_NULLS ON;', { sqlKeywordCase: 'upper' });
        expect(result).toContain('SET NOCOUNT ON;');
        expect(result).toContain('SET ANSI_NULLS ON;');
    });

    it('ALTER PROCEDURE', async () => {
        const result = await fmt(
            'alter procedure GetBooks @Genre nvarchar(100) as begin select BookId from Books where genre = @Genre; end'
        );
        expect(result).toContain('alter procedure GetBooks');
        expect(result).toContain('@Genre nvarchar(100)');
        expect(result).toContain('go');
    });

    it('ALTER FUNCTION scalar', async () => {
        const result = await fmt(
            'alter function GetCount(@Genre nvarchar(100)) returns int as begin return (select count(*) from Books where genre = @Genre); end'
        );
        expect(result).toContain('alter function GetCount');
        expect(result).toContain('@Genre nvarchar(100)');
        expect(result).toContain('returns int');
        expect(result).toContain('go');
    });

    it('CREATE OR ALTER FUNCTION', async () => {
        const result = await fmt(
            'create or alter function GetCount(@Genre nvarchar(100)) returns int as begin return (select count(*) from Books where genre = @Genre); end'
        );
        expect(result).toContain('create or alter function GetCount');
        expect(result).toContain('go');
    });

    it('CREATE FUNCTION inline TVF (RETURNS TABLE)', async () => {
        const result = await fmt(
            'create function GetBooksByGenre(@GenreId int) returns table as return (select Id, Title from Books where GenreId = @GenreId)'
        );
        expect(result).toContain('returns table');
        expect(result).toContain('as');
        expect(result).toContain('return (');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });

    it('CREATE FUNCTION multi-statement TVF (RETURNS @t TABLE)', async () => {
        const result = await fmt(
            'create function GetTopBooks(@MaxPrice decimal(10,2)) returns @result table (Id int, Title nvarchar(200)) as begin insert into @result select Id, Title from Books where Price <= @MaxPrice; return; end'
        );
        expect(result).toContain('returns @result table');
        expect(result).toContain('begin');
        expect(result).toContain('end;');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });
});

describe('CREATE/ALTER TRIGGER', () => {
    it('CREATE TRIGGER after insert', async () => {
        const result = await fmt(
            'create trigger BooksAfterInsertTrigger on Books after insert as begin update Books set Price = Price * 1.1 where BookId in (select BookId from inserted); end'
        );
        expect(result).toContain('create trigger BooksAfterInsertTrigger');
        expect(result).toContain('on Books');
        expect(result).toContain('after insert');
        expect(result).toContain('as');
        expect(result).toContain('begin');
        expect(result).toContain('end;');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });

    it('CREATE TRIGGER instead of update/delete', async () => {
        const result = await fmt(
            'create trigger BooksInsteadOfDeleteTrigger on Books instead of update, delete as begin print \'blocked\'; end'
        );
        expect(result).toContain('instead of update, delete');
        expect(result).toMatchSnapshot();
    });

    it('ALTER TRIGGER', async () => {
        const result = await fmt(
            'alter trigger BooksAfterInsertTrigger on Books after insert as begin return; end'
        );
        expect(result).toContain('alter trigger');
        expect(result).toContain('go');
        expect(result).toMatchSnapshot();
    });

    it('DROP TRIGGER', async () => {
        expect(await fmt('drop trigger BooksAfterInsertTrigger')).toContain('drop trigger BooksAfterInsertTrigger;');
    });

    it('DROP TRIGGER IF EXISTS', async () => {
        expect(await fmt('drop trigger if exists BooksAfterInsertTrigger')).toContain('drop trigger if exists BooksAfterInsertTrigger;');
    });

    it('trigger keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            'create trigger trg on Books after insert as begin return; end',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('CREATE TRIGGER');
        expect(result).toContain('ON Books');
        expect(result).toContain('AFTER INSERT');
    });
});

describe('ALTER INDEX', () => {
    it('ALTER INDEX REBUILD', async () => {
        const result = await fmt('alter index ix_Books_title on Books rebuild');
        expect(result).toContain('alter index ix_Books_title on Books');
        expect(result).toContain('rebuild;');
        expect(result).toMatchSnapshot();
    });

    it('ALTER INDEX ALL REBUILD', async () => {
        const result = await fmt('alter index all on Books rebuild');
        expect(result).toContain('alter index all on Books');
        expect(result).toContain('rebuild;');
        expect(result).toMatchSnapshot();
    });

    it('ALTER INDEX REORGANIZE', async () => {
        const result = await fmt('alter index ix_Books_title on Books reorganize');
        expect(result).toContain('reorganize;');
        expect(result).toMatchSnapshot();
    });

    it('ALTER INDEX DISABLE', async () => {
        const result = await fmt('alter index ix_Books_title on Books disable');
        expect(result).toContain('disable;');
        expect(result).toMatchSnapshot();
    });

    it('alter index keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt('alter index ix_Books_title on Books rebuild', { sqlKeywordCase: 'upper' });
        expect(result).toContain('ALTER INDEX ix_Books_title ON Books');
        expect(result).toContain('REBUILD;');
    });
});

describe('Cursor operations', () => {
    it('DECLARE CURSOR basic', async () => {
        const result = await fmt(
            'declare BookCursor cursor for select BookId, Title from Books where InStock = 1'
        );
        expect(result).toContain('declare BookCursor cursor');
        expect(result).toContain('for');
        expect(result).toContain('select');
        expect(result).toContain('Books');
        expect(result).toMatchSnapshot();
    });

    it('OPEN / FETCH NEXT / CLOSE / DEALLOCATE', async () => {
        const sql = `
open BookCursor;
fetch next from BookCursor into @id, @title;
close BookCursor;
deallocate BookCursor;`;
        const result = await fmt(sql);
        expect(result).toContain('open BookCursor;');
        expect(result).toContain('fetch next from BookCursor');
        expect(result).toContain('@id, @title');
        expect(result).toContain('close BookCursor;');
        expect(result).toContain('deallocate BookCursor;');
        expect(result).toMatchSnapshot();
    });

    it('FETCH FIRST / LAST / PRIOR', async () => {
        const result = await fmt('fetch first from c; fetch last from c; fetch prior from c;');
        expect(result).toContain('fetch first from c;');
        expect(result).toContain('fetch last from c;');
        expect(result).toContain('fetch prior from c;');
    });

    it('cursor keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt(
            'declare c cursor for select BookId from Books; open c; fetch next from c into @id; close c; deallocate c;',
            { sqlKeywordCase: 'upper' }
        );
        expect(result).toContain('DECLARE c CURSOR');
        expect(result).toContain('FOR');
        expect(result).toContain('OPEN c;');
        expect(result).toContain('FETCH NEXT FROM c');
        expect(result).toContain('CLOSE c;');
        expect(result).toContain('DEALLOCATE c;');
    });
});

describe('CREATE/ALTER/DROP SEQUENCE', () => {
    it('CREATE SEQUENCE minimal', async () => {
        const result = await fmt('create sequence OrderSeq as int start with 1 increment by 1');
        expect(result).toContain('create sequence OrderSeq');
        expect(result).toContain('as int');
        expect(result).toContain('start with 1');
        expect(result).toContain('increment by 1');
        expect(result).toMatchSnapshot();
    });

    it('CREATE SEQUENCE with min/max/cycle/cache', async () => {
        const result = await fmt(
            'create sequence Seq as bigint start with 1 increment by 1 minvalue 1 maxvalue 9999 cycle cache 20'
        );
        expect(result).toContain('minvalue 1');
        expect(result).toContain('maxvalue 9999');
        expect(result).toContain('cycle');
        expect(result).toContain('cache 20');
        expect(result).toMatchSnapshot();
    });

    it('CREATE SEQUENCE with NO options', async () => {
        const result = await fmt(
            'create sequence Seq as int start with 1 no minvalue no maxvalue no cycle no cache'
        );
        expect(result).toContain('no minvalue');
        expect(result).toContain('no maxvalue');
        expect(result).toContain('no cycle');
        expect(result).toContain('no cache');
    });

    it('ALTER SEQUENCE restart', async () => {
        const result = await fmt('alter sequence OrderSeq restart with 100 increment by 5');
        expect(result).toContain('alter sequence OrderSeq');
        expect(result).toContain('restart with 100');
        expect(result).toContain('increment by 5');
        expect(result).toMatchSnapshot();
    });

    it('DROP SEQUENCE', async () => {
        expect(await fmt('drop sequence OrderSeq')).toContain('drop sequence OrderSeq;');
    });

    it('DROP SEQUENCE IF EXISTS', async () => {
        expect(await fmt('drop sequence if exists OrderSeq')).toContain('drop sequence if exists OrderSeq;');
    });

    it('sequence keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt('create sequence S as int start with 1 increment by 1', { sqlKeywordCase: 'upper' });
        expect(result).toContain('CREATE SEQUENCE S');
        expect(result).toContain('AS INT');
        expect(result).toContain('START WITH 1');
        expect(result).toContain('INCREMENT BY 1');
    });
});

describe('BULK INSERT', () => {
    it('BULK INSERT basic', async () => {
        const result = await fmt("bulk insert Books from 'C:\\data\\books.csv'");
        expect(result).toContain('bulk insert Books');
        expect(result).toContain("from 'C:\\data\\books.csv'");
        expect(result).toMatchSnapshot();
    });

    it('BULK INSERT with WITH options', async () => {
        const result = await fmt(
            "bulk insert Books from 'C:\\data\\books.csv' with (fieldterminator = ',', rowterminator = '\\n', firstrow = 2)"
        );
        expect(result).toContain('bulk insert Books');
        expect(result).toContain('with (');
        expect(result).toMatchSnapshot();
    });

    it('BULK INSERT keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt("bulk insert Books from 'C:\\data\\books.csv'", { sqlKeywordCase: 'upper' });
        expect(result).toContain('BULK INSERT Books');
        expect(result).toContain('FROM');
    });
});

describe('CREATE TYPE', () => {
    it('CREATE TYPE scalar UDDT', async () => {
        const result = await fmt('create type BookTitle from nvarchar(200) not null');
        expect(result).toContain('create type BookTitle');
        expect(result).toContain('from nvarchar(200)');
        expect(result).toContain('not null');
        expect(result).toMatchSnapshot();
    });

    it('CREATE TYPE scalar UDDT nullable', async () => {
        const result = await fmt('create type OptionalText from nvarchar(500) null');
        expect(result).toContain('from nvarchar(500)');
        expect(result).toContain('null;');
    });

    it('CREATE TYPE table type', async () => {
        const result = await fmt(
            'create type BookList as table (BookId int not null, Title nvarchar(200), Price decimal(10,2))'
        );
        expect(result).toContain('create type BookList');
        expect(result).toContain('as table (');
        expect(result).toContain('BookId int');
        expect(result).toContain('Title nvarchar');
        expect(result).toMatchSnapshot();
    });

    it('type keywords respect sqlKeywordCase upper', async () => {
        const result = await fmt('create type BookTitle from nvarchar(200) not null', { sqlKeywordCase: 'upper' });
        expect(result).toContain('CREATE TYPE BookTitle');
        expect(result).toContain('FROM NVARCHAR(200)');
        expect(result).toContain('NOT NULL');
    });
});

describe('GRANT / DENY / REVOKE', () => {
    it('GRANT multiple permissions ON object TO principal', async () => {
        expect(await fmt('grant select, insert on object::Books to AppUser')).toBe(
            'grant select, insert\non object::Books\nto AppUser;'
        );
    });

    it('GRANT single permission ON object TO principal', async () => {
        expect(await fmt('grant execute on GetBooks to AppUser')).toBe(
            'grant execute\non GetBooks\nto AppUser;'
        );
    });

    it('GRANT with column list', async () => {
        expect(await fmt('grant select (Title, Price) on Books to AppUser with grant option')).toBe(
            'grant select (Title, Price)\non Books\nto AppUser\nwith grant option;'
        );
    });

    it('GRANT server-scoped permission (no ON)', async () => {
        expect(await fmt('grant alter any user to dbo')).toBe(
            'grant alter any user\nto dbo;'
        );
    });

    it('GRANT TO PUBLIC', async () => {
        expect(await fmt('grant connect to public')).toBe(
            'grant connect\nto public;'
        );
    });

    it('GRANT ON SCHEMA::', async () => {
        expect(await fmt('grant control on schema::dbo to AppUser')).toBe(
            'grant control\non schema::dbo\nto AppUser;'
        );
    });

    it('GRANT TO multiple principals', async () => {
        expect(await fmt('grant execute on GetBooks to AppUser, GuestUser')).toBe(
            'grant execute\non GetBooks\nto AppUser, GuestUser;'
        );
    });

    it('DENY with CASCADE', async () => {
        expect(await fmt('deny delete on object::Books to GuestUser')).toBe(
            'deny delete\non object::Books\nto GuestUser;'
        );
    });

    it('REVOKE FROM principal', async () => {
        expect(await fmt('revoke select on object::Books from AppUser')).toBe(
            'revoke select\non object::Books\nfrom AppUser;'
        );
    });

    it('REVOKE GRANT OPTION FOR with CASCADE', async () => {
        expect(await fmt('revoke grant option for select on object::Books from AppUser cascade')).toBe(
            'revoke grant option for select\non object::Books\nfrom AppUser\ncascade;'
        );
    });
});

describe('CREATE/ALTER/DROP USER', () => {
    it('CREATE USER ... FOR LOGIN', async () => {
        expect(await fmt('create user AppUser for login AppLogin')).toBe(
            'create user AppUser\nfor login AppLogin;'
        );
    });

    it('CREATE USER ... WITHOUT LOGIN', async () => {
        expect(await fmt('create user SvcUser without login')).toBe(
            'create user SvcUser\nwithout login;'
        );
    });

    it('CREATE USER ... FROM EXTERNAL PROVIDER', async () => {
        expect(await fmt('create user AzureUser from external provider')).toBe(
            'create user AzureUser\nfrom external provider;'
        );
    });

    it('CREATE USER ... FOR LOGIN WITH DEFAULT_SCHEMA', async () => {
        expect(await fmt("create user AppUser for login AppLogin with default_schema = dbo")).toBe(
            'create user AppUser\nfor login AppLogin\nwith\n  default_schema = dbo;'
        );
    });

    it('ALTER USER ... WITH NAME', async () => {
        expect(await fmt('alter user AppUser with name = NewUser')).toBe(
            'alter user AppUser\nwith\n  name = NewUser;'
        );
    });

    it('DROP USER', async () => {
        expect(await fmt('drop user AppUser')).toBe('drop user AppUser;');
    });
});

describe('CREATE/ALTER/DROP LOGIN', () => {
    it('CREATE LOGIN with password', async () => {
        expect(await fmt("create login AppLogin with password = 'P@ssw0rd'")).toBe(
            "create login AppLogin\nwith\n  password = 'P@ssw0rd';"
        );
    });

    it('CREATE LOGIN with password and options', async () => {
        expect(await fmt("create login AppLogin with password = 'P@ssw0rd', default_database = master, check_policy = on")).toBe(
            "create login AppLogin\nwith\n  password = 'P@ssw0rd',\n  default_database = master,\n  check_policy = on;"
        );
    });

    it('CREATE LOGIN from Windows', async () => {
        expect(await fmt('create login WindowsUser from windows')).toBe(
            'create login WindowsUser\nfrom windows;'
        );
    });

    it('ALTER LOGIN ENABLE', async () => {
        expect(await fmt('alter login AppLogin enable')).toBe('alter login AppLogin enable;');
    });

    it('ALTER LOGIN DISABLE', async () => {
        expect(await fmt('alter login AppLogin disable')).toBe('alter login AppLogin disable;');
    });

    it('ALTER LOGIN with new password', async () => {
        expect(await fmt("alter login AppLogin with password = 'NewP@ss'")).toBe(
            "alter login AppLogin\nwith\n  password = 'NewP@ss';"
        );
    });

    it('DROP LOGIN', async () => {
        expect(await fmt('drop login AppLogin')).toBe('drop login AppLogin;');
    });
});

describe('CREATE/ALTER/DROP ROLE', () => {
    it('CREATE ROLE', async () => {
        expect(await fmt('create role db_reader')).toBe('create role db_reader;');
    });

    it('CREATE ROLE with AUTHORIZATION', async () => {
        expect(await fmt('create role db_reader authorization dbo')).toBe(
            'create role db_reader\nauthorization dbo;'
        );
    });

    it('ALTER ROLE ADD MEMBER', async () => {
        expect(await fmt('alter role db_reader add member AppUser')).toBe(
            'alter role db_reader\nadd member AppUser;'
        );
    });

    it('ALTER ROLE DROP MEMBER', async () => {
        expect(await fmt('alter role db_reader drop member AppUser')).toBe(
            'alter role db_reader\ndrop member AppUser;'
        );
    });

    it('ALTER ROLE WITH NAME', async () => {
        expect(await fmt('alter role db_reader with name = db_reader_v2')).toBe(
            'alter role db_reader\nwith name = db_reader_v2;'
        );
    });

    it('DROP ROLE', async () => {
        expect(await fmt('drop role db_reader')).toBe('drop role db_reader;');
    });

    it('DROP ROLE IF EXISTS', async () => {
        expect(await fmt('drop role if exists db_reader')).toBe('drop role if exists db_reader;');
    });
});

describe('CREATE/DROP SYNONYM', () => {
    it('CREATE SYNONYM simple', async () => {
        expect(await fmt('create synonym MyAlias for dbo.Books')).toBe(
            'create synonym MyAlias for dbo.Books;'
        );
    });

    it('CREATE SYNONYM schema-qualified', async () => {
        expect(await fmt('create synonym dbo.MyAlias for dbo.Books')).toBe(
            'create synonym dbo.MyAlias for dbo.Books;'
        );
    });

    it('DROP SYNONYM', async () => {
        expect(await fmt('drop synonym MyAlias')).toBe('drop synonym MyAlias;');
    });

    it('DROP SYNONYM IF EXISTS', async () => {
        expect(await fmt('drop synonym if exists dbo.MyAlias')).toBe(
            'drop synonym if exists dbo.MyAlias;'
        );
    });

    it('keyword case: upper', async () => {
        const result = await fmt('create synonym MyAlias for dbo.Books', { sqlKeywordCase: 'upper' });
        expect(result).toBe('CREATE SYNONYM MyAlias FOR dbo.Books;');
    });
});

describe('CREATE/ALTER/DROP SCHEMA', () => {
    it('CREATE SCHEMA simple', async () => {
        expect(await fmt('create schema sales')).toBe('create schema sales;');
    });

    it('CREATE SCHEMA with AUTHORIZATION', async () => {
        expect(await fmt('create schema sales authorization dbo')).toBe(
            'create schema sales authorization dbo;'
        );
    });

    it('ALTER SCHEMA TRANSFER (plain object)', async () => {
        expect(await fmt('alter schema sales transfer dbo.Books')).toBe(
            'alter schema sales transfer dbo.Books;'
        );
    });

    it('ALTER SCHEMA TRANSFER TYPE::', async () => {
        expect(await fmt('alter schema sales transfer type::dbo.BookTitle')).toBe(
            'alter schema sales transfer type::dbo.BookTitle;'
        );
    });

    it('DROP SCHEMA', async () => {
        expect(await fmt('drop schema sales')).toBe('drop schema sales;');
    });

    it('DROP SCHEMA IF EXISTS', async () => {
        expect(await fmt('drop schema if exists sales')).toBe('drop schema if exists sales;');
    });

    it('keyword case: upper', async () => {
        const result = await fmt('create schema sales authorization dbo', { sqlKeywordCase: 'upper' });
        expect(result).toBe('CREATE SCHEMA sales AUTHORIZATION dbo;');
    });
});

describe('IS [NOT] DISTINCT FROM (SQL Server 2022+)', () => {
    it('IS DISTINCT FROM', async () => {
        const result = await fmt('select 1 where a IS DISTINCT FROM b');
        expect(result).toMatchSnapshot();
    });

    it('IS NOT DISTINCT FROM', async () => {
        const result = await fmt('select 1 where a IS NOT DISTINCT FROM b');
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt('select 1 where a is distinct from b', { sqlKeywordCase: 'upper' });
        expect(result).toContain('IS DISTINCT FROM');
    });

    it('keyword case: lower', async () => {
        const result = await fmt('select 1 where a IS DISTINCT FROM b', { sqlKeywordCase: 'lower' });
        expect(result).toContain('is distinct from');
    });
});

describe('OVER (window_name) (SQL Server 2022+)', () => {
    it('window function referencing named window', async () => {
        const result = await fmt(
            'select row_number() over w from Books window w as (partition by AuthorId order by Title)'
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('window w as (');
        expect(result).toContain('partition by AuthorId');
        expect(result).toContain('order by Title asc');
    });

    it('keyword case: upper', async () => {
        const result = await fmt('select row_number() over w from t window w as (order by id)', {
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('OVER (w)');
        expect(result).toContain('WINDOW w AS (');
        expect(result).toContain('ORDER BY id ASC');
    });

    it('window with ROWS BETWEEN frame', async () => {
        const result = await fmt(
            'select sum(Price) over w from Books window w as (partition by AuthorId order by Id rows between unbounded preceding and current row)'
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('rows between unbounded preceding and current row');
    });

    it('window with RANGE UNBOUNDED PRECEDING (no BETWEEN)', async () => {
        const result = await fmt(
            'select sum(Price) over w from Books window w as (order by Id range unbounded preceding)'
        );
        expect(result).toContain('range unbounded preceding');
    });

    it('multiple named windows', async () => {
        const result = await fmt(
            'select row_number() over w1, rank() over w2 from Books window w1 as (partition by AuthorId order by Id), w2 as (order by Price)'
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('window');
        expect(result).toContain('w1 as (');
        expect(result).toContain('w2 as (');
    });

    it('window with ROWS N PRECEDING', async () => {
        const result = await fmt(
            'select avg(Price) over w from Books window w as (order by Id rows 3 preceding)'
        );
        expect(result).toContain('rows 3 preceding');
    });

    it('inline window frame on OVER clause (no named window)', async () => {
        const result = await fmt(
            'select sum(Price) over (partition by AuthorId order by Id rows between unbounded preceding and current row) from Books'
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('rows between unbounded preceding and current row');
    });
});

describe('IGNORE NULLS / RESPECT NULLS (SQL Server 2022+)', () => {
    it('FIRST_VALUE IGNORE NULLS', async () => {
        const result = await fmt(
            'select first_value(Price) ignore nulls over (partition by AuthorId order by PublishedDate) from Books'
        );
        expect(result).toMatchSnapshot();
    });

    it('LAST_VALUE RESPECT NULLS', async () => {
        const result = await fmt(
            'select last_value(Price) respect nulls over (order by PublishedDate) from Books'
        );
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt('select first_value(x) ignore nulls over (order by id) from t', {
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('IGNORE NULLS');
    });
});

describe('TRIM(direction ...) (SQL Server 2022+)', () => {
    it('TRIM with LEADING', async () => {
        const result = await fmt("select trim(leading ' ' from Title) from Books");
        expect(result).toMatchSnapshot();
    });

    it('TRIM with TRAILING', async () => {
        const result = await fmt("select trim(trailing ' ' from Title) from Books");
        expect(result).toMatchSnapshot();
    });

    it('TRIM with BOTH', async () => {
        const result = await fmt("select trim(both ' ' from Title) from Books");
        expect(result).toMatchSnapshot();
    });

    it('TRIM without direction still works', async () => {
        const result = await fmt("select trim(' ' from Title) from Books");
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt("select trim(leading ' ' from title) from t", {
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('TRIM(LEADING');
        expect(result).toContain('FROM');
    });
});

describe('JSON_OBJECT (SQL Server 2022+)', () => {
    it('basic key-value pairs', async () => {
        const result = await fmt("select json_object('name': Title, 'price': Price) from Books");
        expect(result).toMatchSnapshot();
    });

    it('with ABSENT ON NULL', async () => {
        const result = await fmt(
            "select json_object('name': Title, 'price': Price absent on null) from Books"
        );
        expect(result).toMatchSnapshot();
    });

    it('with NULL ON NULL', async () => {
        const result = await fmt("select json_object('id': Id null on null) from Books");
        expect(result).toMatchSnapshot();
    });

    it('single pair inline', async () => {
        const result = await fmt("select json_object('id': Id) from Books");
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt("select json_object('name': Title absent on null) from Books", {
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('JSON_OBJECT(');
        expect(result).toContain('ABSENT ON NULL');
    });

    it('keyword case: lower', async () => {
        const result = await fmt("select JSON_OBJECT('name': Title ABSENT ON NULL) from Books", {
            sqlKeywordCase: 'lower',
        });
        expect(result).toContain('json_object(');
        expect(result).toContain('absent on null');
    });
});

describe('JSON_ARRAY (SQL Server 2022+)', () => {
    it('basic values', async () => {
        const result = await fmt("select json_array(1, 2, 'three')");
        expect(result).toMatchSnapshot();
    });

    it('with ABSENT ON NULL', async () => {
        const result = await fmt("select json_array(1, 2, 'three' absent on null)");
        expect(result).toMatchSnapshot();
    });

    it('with NULL ON NULL', async () => {
        const result = await fmt("select json_array(1, null null on null)");
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt("select json_array(1, 2 absent on null)", { sqlKeywordCase: 'upper' });
        expect(result).toContain('JSON_ARRAY(');
        expect(result).toContain('ABSENT ON NULL');
    });
});

describe('JSON_ARRAYAGG (SQL Server 2022+)', () => {
    it('basic aggregation', async () => {
        const result = await fmt('select json_arrayagg(Title) from Books');
        expect(result).toMatchSnapshot();
    });

    it('with ORDER BY', async () => {
        const result = await fmt('select json_arrayagg(Title order by Title) from Books');
        expect(result).toMatchSnapshot();
    });

    it('with ORDER BY and ABSENT ON NULL', async () => {
        const result = await fmt(
            'select json_arrayagg(Title order by Title absent on null) from Books'
        );
        expect(result).toMatchSnapshot();
    });

    it('keyword case: upper', async () => {
        const result = await fmt('select json_arrayagg(Title order by Title absent on null) from Books', {
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('JSON_ARRAYAGG(');
        expect(result).toContain('ORDER BY');
        expect(result).toContain('ABSENT ON NULL');
    });
});

describe('sqlCommaStyle: leading', () => {
    const leading = { sqlCommaStyle: 'leading' };

    it('SELECT multi-column uses leading commas', async () => {
        const result = await fmt(
            'select b.BookId, b.Title, b.Price from Books as b',
            leading,
        );
        expect(result).toMatchSnapshot();
        const lines = result.split('\n');
        // All non-first column lines should start with leading comma (after trim)
        const colLines = lines.filter((l) => l.trimStart().startsWith(','));
        expect(colLines.length).toBe(2);
    });

    it('ORDER BY multi-column uses leading commas', async () => {
        const result = await fmt(
            'select Id from Books order by Title asc, Price desc, AuthorId asc',
            leading,
        );
        expect(result).toMatchSnapshot();
        const lines = result.split('\n');
        expect(lines.filter((l) => l.trimStart().startsWith(','))).toHaveLength(2);
    });

    it('GROUP BY multi-column uses leading commas', async () => {
        const result = await fmt(
            'select GenreId, AuthorId, count(*) from Books group by GenreId, AuthorId',
            leading,
        );
        expect(result).toMatchSnapshot();
    });

    it('CTE list uses leading commas', async () => {
        const result = await fmt(
            'with cte1 as (select 1 as x), cte2 as (select 2 as y), cte3 as (select 3 as z) select * from cte1',
            leading,
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('\n, cte2');
        expect(result).toContain('\n, cte3');
    });

    it('single SELECT column is not affected (no comma)', async () => {
        const result = await fmt('select Title from Books', leading);
        expect(result).toBe('select Title\nfrom Books;');
    });

    it('trailing (default) still produces trailing commas', async () => {
        const result = await fmt('select a, b, c from t');
        const lines = result.split('\n');
        // column lines should end with comma (trailing)
        expect(lines.some((l) => l.trimEnd().endsWith(','))).toBe(true);
        expect(lines.every((l) => !l.trimStart().startsWith(','))).toBe(true);
    });

    it('combines with keyword case upper', async () => {
        const result = await fmt('select a, b, c from t order by a, b', {
            sqlCommaStyle: 'leading',
            sqlKeywordCase: 'upper',
        });
        expect(result).toContain('SELECT');
        const lines = result.split('\n');
        expect(lines.filter((l) => l.trimStart().startsWith(','))).toHaveLength(3); // 2 select + 1 order by
    });

    it('INSERT VALUES multi-row uses leading commas between rows', async () => {
        const result = await fmt(
            "insert into Books (Title, Price) values ('A', 1.00), ('B', 2.00), ('C', 3.00)",
            leading,
        );
        expect(result).toMatchSnapshot();
        // Leading commas appear on column list, within each row, and between rows
        expect(result.split('\n').some((l) => l.trimStart().startsWith(','))).toBe(true);
    });

    it('UPDATE SET multi-column uses leading commas', async () => {
        const result = await fmt(
            'update Books set Title = @title, Price = @price, AuthorId = @authorId where BookId = @id',
            leading,
        );
        expect(result).toMatchSnapshot();
        const lines = result.split('\n');
        expect(lines.filter((l) => l.trimStart().startsWith(','))).toHaveLength(2);
    });

    it('trailing (default) INSERT VALUES still uses trailing commas', async () => {
        const result = await fmt("insert into t (a, b) values (1, 2), (3, 4)");
        const lines = result.split('\n');
        expect(lines.some((l) => l.trimEnd().endsWith(','))).toBe(true);
        expect(lines.every((l) => !l.trimStart().startsWith(','))).toBe(true);
    });
});

describe('EXECUTE AS / REVERT', () => {
    it('EXECUTE AS CALLER', async () => {
        const result = await fmt('execute as caller;');
        expect(result).toBe('execute as caller;');
    });

    it('EXECUTE AS USER', async () => {
        const result = await fmt("execute as user = 'dbo';");
        expect(result).toContain('execute as');
        expect(result).toContain('dbo');
    });

    it('EXECUTE AS LOGIN', async () => {
        const result = await fmt("execute as login = 'sa';");
        expect(result).toContain('execute as');
        expect(result).toContain('sa');
    });

    it('EXECUTE AS with WITH NO REVERT', async () => {
        const result = await fmt('execute as caller with no revert;');
        expect(result).toContain('execute as caller');
        expect(result).toContain('with no revert');
    });

    it('REVERT plain', async () => {
        const result = await fmt('revert;');
        expect(result).toBe('revert;');
    });

    it('REVERT uppercase', async () => {
        const result = await fmt('revert;', { sqlKeywordCase: 'upper' });
        expect(result).toBe('REVERT;');
    });

    it('proc WITH ENCRYPTION', async () => {
        const result = await fmt(
            'create procedure dbo.MyProc with encryption as begin select 1; end',
        );
        expect(result).toContain('with encryption');
        expect(result).toContain('create procedure');
    });

    it('proc WITH RECOMPILE', async () => {
        const result = await fmt(
            'create procedure dbo.MyProc with recompile as begin select 1; end',
        );
        expect(result).toContain('with recompile');
    });

    it('proc WITH EXECUTE AS OWNER', async () => {
        const result = await fmt(
            "create procedure dbo.MyProc with execute as owner as begin select 1; end",
        );
        expect(result).toContain('with execute as owner');
    });
});

describe('partition functions', () => {
    it('CREATE PARTITION FUNCTION RANGE RIGHT', async () => {
        const result = await fmt(
            "create partition function pf_date (date) as range right for values ('2020-01-01', '2021-01-01', '2022-01-01')",
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('range right');
        expect(result).toContain("'2021-01-01'");
    });

    it('CREATE PARTITION FUNCTION RANGE LEFT', async () => {
        const result = await fmt(
            'create partition function pf_price (decimal(10,2)) as range left for values (100, 500, 1000)',
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('range left');
        expect(result).toContain('decimal(10,2)');
    });

    it('CREATE PARTITION FUNCTION uppercase', async () => {
        const result = await fmt(
            "create partition function pf_date (date) as range right for values ('2020-01-01')",
            { sqlKeywordCase: 'upper' },
        );
        expect(result).toContain('CREATE PARTITION FUNCTION');
        expect(result).toContain('AS RANGE RIGHT');
        expect(result).toContain('FOR VALUES');
    });

    it('ALTER PARTITION FUNCTION SPLIT RANGE', async () => {
        const result = await fmt("alter partition function pf_date() split range ('2023-01-01')");
        expect(result).toMatchSnapshot();
        expect(result).toContain('split range');
    });

    it('ALTER PARTITION FUNCTION MERGE RANGE', async () => {
        const result = await fmt("alter partition function pf_date() merge range ('2020-01-01')");
        expect(result).toMatchSnapshot();
        expect(result).toContain('merge range');
    });

    it('DROP PARTITION FUNCTION', async () => {
        const result = await fmt('drop partition function pf_date');
        expect(result).toBe('drop partition function pf_date;');
    });

});

describe('partition schemes', () => {
    it('CREATE PARTITION SCHEME', async () => {
        const result = await fmt(
            'create partition scheme ps_date as partition pf_date to ([PRIMARY], fg1, fg2, fg3)',
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('as partition');
        expect(result).toContain('[PRIMARY]');
    });

    it('CREATE PARTITION SCHEME ALL TO', async () => {
        const result = await fmt(
            'create partition scheme ps_date as partition pf_date all to ([PRIMARY])',
        );
        expect(result).toMatchSnapshot();
        expect(result).toContain('all to');
    });

    it('CREATE PARTITION SCHEME uppercase', async () => {
        const result = await fmt(
            'create partition scheme ps_date as partition pf_date to ([PRIMARY], fg1)',
            { sqlKeywordCase: 'upper' },
        );
        expect(result).toContain('CREATE PARTITION SCHEME');
        expect(result).toContain('AS PARTITION');
        expect(result).toContain('TO');
    });

    it('ALTER PARTITION SCHEME NEXT USED with filegroup', async () => {
        const result = await fmt('alter partition scheme ps_date next used fg_new');
        expect(result).toMatchSnapshot();
        expect(result).toContain('next used');
    });

    it('ALTER PARTITION SCHEME NEXT USED without filegroup', async () => {
        const result = await fmt('alter partition scheme ps_date next used');
        expect(result).toContain('next used');
    });

    it('DROP PARTITION SCHEME', async () => {
        const result = await fmt('drop partition scheme ps_date');
        expect(result).toBe('drop partition scheme ps_date;');
    });

});
