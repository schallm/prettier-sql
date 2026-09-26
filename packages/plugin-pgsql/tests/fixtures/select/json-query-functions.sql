-- SQL/JSON query functions, JSON_TABLE and constructors with all their clauses

select json_query(doc, '$.a' with wrapper), json_query(doc, '$.a' with conditional wrapper omit quotes), json_query(doc, '$.a' without wrapper keep quotes null on empty error on error);

select json_value(doc, '$.a' returning int default 0 on empty default -1 on error), json_value(doc format json, '$.a ? (@ > $x)' passing 5 as x, 'q' as "Y");

select json_exists(doc, '$.a' true on error), json_query(doc, '$' returning jsonb empty array on empty empty object on error);

select * from json_table(doc, '$[*]' as p passing 1 as x columns (id int path '$.id' default 0 on empty null on error, v jsonb format json path '$.v' with wrapper, e bool exists path '$.e' false on error, nested path '$.n[*]' as np columns (w text path '$')) error on error) jt;

select json_object('a': 1 absent on null with unique keys returning jsonb), json_array(1, 2 null on null), json_objectagg(k: v), json_arrayagg(v order by v);

select json_arrayagg(v order by v null on null) filter (where v > 0) over (partition by k), json_objectagg(k: v absent on null returning jsonb), json_object('a': '{}' format json), json_array('[1]' format json);
