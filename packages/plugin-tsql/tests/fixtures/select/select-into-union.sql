-- SELECT INTO in the first query of a UNION, or inside parentheses
select BookId into #Ids from dbo.Books union select BookId from dbo.Archive;
(select BookId into #Ids2 from dbo.Books) union select BookId from dbo.Archive;
((select BookId into #Ids3 on [PRIMARY] from dbo.Books));
