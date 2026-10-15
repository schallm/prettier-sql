select BookId from Books option (force distributed plan)

select BookId, Title from Books where InStock = 1 option (force single node plan, maxdop 2)

select BookId from Books option (for timestamp as of '2024-05-01T00:00:00')

select BookId from Books option (fast 10, maxrecursion 5, querytraceon 9481, label = 'books')

select BookId from Books option (bypass optimizer_queue, expand views)

select BookId from Books option (checkconstraints plan, optimize correlated union all)

-- The older USEPLAN n is one word
select Title from Books option (useplan 2, shrinkdb plan);
