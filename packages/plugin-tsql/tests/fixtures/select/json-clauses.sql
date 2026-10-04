-- RETURNING type and WITH ARRAY WRAPPER — SQL Server 2025
select json_value(data, '$.price' returning int) from events

select json_value(data, '$.price' returning decimal(10, 2)), json_value(data, '$.kind' returning nvarchar(max)) from events

select json_value(data, '$.amount' returning dbo.Money) from events

select json_object('id': Id, 'title': Title returning json) from Books

select json_object('id': Id absent on null returning json) from Books

select json_array(1, 2, 'three' returning json)

select json_array(1, null null on null returning json)

select json_arrayagg(Title returning json) from Books

select json_arrayagg(Title order by Title absent on null returning json) from Books

select json_objectagg(Name: Value returning json)
from Config
group by Name

select json_value(OrderDocument, '$.customer.shippingAddress.postalCode' returning nvarchar(20)) as PostalCode from Orders

select json_query(data, '$.tags' with array wrapper) from events

select json_query(data with array wrapper) from events
