-- On its own, WITH CHANGE_TRACKING_CONTEXT is a line before the statement
with change_tracking_context (0xff) update Books set Price = 10 where BookId = 1;

-- With CTEs it shares their WITH
with change_tracking_context (0xff), Cheap (BookId) as (select BookId from Books where Price < 5) update Books set Price = 5 where BookId in (select BookId from Cheap);
with change_tracking_context (@ctx), Old as (select BookId from Books where Year < 1900) delete from Books where BookId in (select BookId from Old);
with change_tracking_context (0x01), Src as (select 1 as Id) insert into Books (BookId) select Id from Src;
with change_tracking_context (0x01), Src as (select 1 as Id) merge Books as t using Src as s on t.BookId = s.Id when matched then delete;
with change_tracking_context (0x01) merge Books as t using Prices as s on t.BookId = s.BookId when matched then update set Price = s.Price;

-- XMLNAMESPACES on data-changing statements
with xmlnamespaces ('urn:books' as b) update Books set Title = Doc.value('(/b:book/b:title)[1]', 'nvarchar(100)');
with xmlnamespaces ('urn:books' as b), Src as (select Doc from Staging) insert into Books (Doc) select Doc from Src;
