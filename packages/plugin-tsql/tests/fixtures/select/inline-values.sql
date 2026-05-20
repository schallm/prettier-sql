select v.Id, v.Name from (values (1, 'Alice'), (2, 'Bob')) as v(Id, Name)

select v.Id from (values (1), (2), (3)) as v(Id)

select p.ProductId, p.Price from (values (101, 9.99), (102, 14.99), (103, 4.99)) as p(ProductId, Price) where p.Price < 10
