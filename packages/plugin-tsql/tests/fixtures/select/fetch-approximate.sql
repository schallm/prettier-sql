-- FETCH without OFFSET
select a from t order by a fetch next 5 rows only

-- Vector search: approximate nearest neighbours — SQL Server 2025
select top (10) with approximate Id, vector_distance('cosine', Embedding, @q) as Distance from Docs order by Distance

select top (10) percent with approximate Id from Docs order by vector_distance('cosine', Embedding, @q)

select Id from Docs order by vector_distance('cosine', Embedding, @q) fetch approximate next 10 rows only

select Id from Docs order by vector_distance('cosine', Embedding, @q) fetch approx first 1 row only

select Id from Docs union select Id from Archive order by Id fetch approximate next 10 rows only

select a from t order by a offset 2 rows fetch next 5 rows only
