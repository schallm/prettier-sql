create function GetTopBooks (@MaxPrice decimal(10, 2)) returns @result table (Id int not null, Title nvarchar(200) not null, Price decimal(10, 2) not null) as begin insert into @result select Id, Title, Price from Books where Price <= @MaxPrice order by Price; return; end
go

-- The returned table keeps its elements in the order written, with their comments
create function dbo.OpenLoans()
returns @loans table (primary key (LoanId), -- one row per loan
    LoanId int, BookId int -- the book lent
)
as begin
    insert @loans select LoanId, BookId from Loans where ReturnedOn is null;
    return;
end
