select Id, Title, Price
from Books
for xml auto

select Id, Title, Price
from Books
for xml path('Book'), root('Books'), type

select Id, Name, Category
from Products
for xml raw('Product'), elements, root('Catalog')

select OrderId, CustomerId, Total
from Orders
for json auto

select Id, Title as name, Price as price
from Books
for json path, root('Books'), include_null_values

select Id, Title
from Books
for json path, without_array_wrapper

select * from Books for browse
