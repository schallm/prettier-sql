-- IS [NOT] DISTINCT FROM with ALL / ANY / SOME and a subquery
select BookId from Books where AuthorId is distinct from all (select Id from Authors where Country = 'NZ');
select BookId from Books where AuthorId is not distinct from any (select Id from Authors);
