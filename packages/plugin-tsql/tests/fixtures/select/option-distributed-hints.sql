select BookId from Books option (force distributed plan)

select BookId, Title from Books where InStock = 1 option (force single node plan, maxdop 2)

select BookId from Books option (for timestamp as of '2024-05-01T00:00:00')

select BookId from Books option (fast 10, maxrecursion 5, querytraceon 9481, label = 'books')
