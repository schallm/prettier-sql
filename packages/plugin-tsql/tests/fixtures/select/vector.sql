-- VECTOR data type — SQL Server 2025
create table Embeddings (
    Id int not null,
    Vec vector(1536) not null
)

-- VECTOR_DISTANCE — compute distance between two vectors
select vector_distance('cosine', e1.Vec, e2.Vec) as Distance
from Embeddings e1
cross join Embeddings e2
where e1.Id <> e2.Id

-- VECTOR_NORM — magnitude of a vector
select Id, vector_norm(Vec) as Magnitude
from Embeddings

-- VECTOR_NORMALIZE — return unit vector
select Id, vector_normalize(Vec) as Normalized
from Embeddings

-- VECTORPROPERTY — query metadata about a vector column
select vectorproperty(Vec, 'Dimensions') as Dims
from Embeddings

-- DECLARE with vector type
declare @v vector(3)
set @v = '[1.0, 2.0, 3.0]'
