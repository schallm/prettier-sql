-- OUTPUT ... INTO a table and a plain OUTPUT to the client, together
update Books set Price = Price * 1.1 output deleted.BookId, inserted.Price into @changes output inserted.BookId as [Id], 12 * 12 as [144] where InStock = 1;
insert into Archive (BookId) output inserted.BookId into @log (BookId) output inserted.BookId select BookId from Books where Price = 0;
delete from Books output deleted.BookId into @gone output deleted.Title where Price is null;
merge Books as t using Prices as s on t.BookId = s.BookId when matched then update set Price = s.Price output $action, inserted.BookId into @audit output $action;
