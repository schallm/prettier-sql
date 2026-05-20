insert into ArchivedBooks (Id, Title, Price) select Id, Title, Price from Books where InStock = 0
