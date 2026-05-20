create view dbo.BookSummary with schemabinding as
select b.Id, b.Title, b.Price
from dbo.Books as b
