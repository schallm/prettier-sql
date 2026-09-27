select xmlelement(name foo, 'bar');

select xmlelement(name order, xmlattributes(o.orderid), o.ordername)
from orders as o;

select xmlforest(title, author as written_by)
from books;

select xmlconcat(xmlelement(name a, 1), xmlelement(name b, 2));

select xmlagg(xmlelement(name item, title) order by title)
from books;

select xmlparse(document '<a/>'), xmlparse(content '<a/>');

select xmlroot(x, version '1.0', standalone yes), xmlroot(x, version no value, standalone no value);

select xmlserialize(document x as text), xmlserialize(content x as text indent);
