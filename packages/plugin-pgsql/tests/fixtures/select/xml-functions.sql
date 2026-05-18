select xmlelement(name foo, 'bar');

select xmlelement(name order, xmlattributes(o.orderid), o.ordername)
from orders as o;

select xmlforest(title, author as written_by)
from books;

select xmlconcat(xmlelement(name a, 1), xmlelement(name b, 2));

select xmlagg(xmlelement(name item, title) order by title)
from books;
