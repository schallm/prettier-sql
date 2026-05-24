-- Basic XMLTABLE with PATH and FOR ORDINALITY
select t.title, t.price, t.id
from books_xml as src,
xmltable('/bookstore/book' passing src.content
    columns
        title text path '@title',
        price numeric path 'price',
        id for ordinality
) as t;

-- XMLTABLE with DEFAULT and NOT NULL
select t.title, t.qty
from catalog_xml as src,
xmltable('//item' passing src.doc
    columns
        title text path 'title' default 'Unknown',
        qty integer path 'quantity' not null
) as t;
