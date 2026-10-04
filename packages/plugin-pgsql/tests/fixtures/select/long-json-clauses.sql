select json_query(doc, '$.a' returning jsonb with wrapper keep quotes null on empty error on error) as j from t;
select json_value(doc, '$.a' returning integer default 0 on empty default -1 on error), json_value(doc, '$.b') from t;
select json_query(doc, '$.items[*] ? (@.price > $min)' passing 10 as min, 'x' as label returning jsonb with conditional wrapper omit quotes empty array on empty) from t;
select json_exists(doc, '$.a' passing 1 as x, 2 as y, 3 as z error on error) from t;
