-- CREATE VECTOR INDEX — SQL Server 2025
create vector index IX_Embeddings_Vec on Embeddings(Vec)
with (metric = 'cosine')

-- METRIC options: cosine, dot, euclidean
create vector index IX_Embeddings_Dot on Embeddings(Vec)
with (metric = 'dot')

-- TYPE option: DiskANN (default)
create vector index IX_Embeddings_Full on Embeddings(Vec)
with (metric = 'cosine', type = 'DiskANN')
