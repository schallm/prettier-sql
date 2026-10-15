select b.id, r.avg_price from books as b, lateral (select avg(price) as avg_price from books where author_id = b.author_id) as r;

-- LATERAL table functions that read an earlier FROM item
select x.* from xmldata, lateral xmltable('/rows/row' passing data columns id int path '@id', name text) as x;
select j.* from orders o, lateral json_table(o.doc, '$.items[*]' columns (sku text path '$.sku', qty int path '$.qty')) as j;

-- An EXISTS column without a path checks the path named after the column
select * from json_table(doc, '$' columns (author text, has_isbn boolean exists)) as jt;
