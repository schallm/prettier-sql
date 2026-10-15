-- A user function named AI_GENERATE_CHUNKS keeps its brackets: bare, it is the built-in function
select c.Chunk from Documents as d cross apply dbo.AI_GENERATE_CHUNKS([Source]) as c;
