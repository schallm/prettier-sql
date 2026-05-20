-- Brackets stripped when not needed
select [Books].[Id], [Books].[Title] from [Books] where [Books].[InStock] = 1

-- Brackets preserved when name contains spaces
select [My Table].[Book Id], [My Table].[Book Title] from [My Table]

-- Brackets preserved when name starts with digit
select [123abc] from [My Schema].[My Table]

-- Mixed: some need brackets, some don't
select [Books].[Id], [My Table].[Book Title] from [Books] inner join [My Table] on [Books].[Id] = [My Table].[Book Id]
