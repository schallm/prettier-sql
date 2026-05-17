select Id from Books where Price > all(select Price from ArchivedBooks)

select Id from Books where Price = any(select Price from FeaturedBooks)

select Id from Books where Price >= any(select min(Price) from Books where InStock = 1)
