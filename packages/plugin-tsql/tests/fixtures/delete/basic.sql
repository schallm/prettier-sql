delete from Books where InStock = 0 and PublishedDate < dateadd(year, -10, getdate())
