select json_object('name': Title, 'price': Price) from Books

select json_object('name': Title, 'price': Price absent on null) from Books

select json_object('id': Id null on null) from Books

select json_array(1, 2, 'three')

select json_array(1, 2, 'three' absent on null)

select json_arrayagg(Title) from Books

select json_arrayagg(Title order by Title) from Books

select json_arrayagg(Title order by Title absent on null) from Books
