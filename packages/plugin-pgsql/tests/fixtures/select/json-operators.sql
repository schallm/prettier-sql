-- -> and ->> (key access)
select data -> 'name', data ->> 'email' from users;

-- #> and #>> (path access)
select data #> '{address,city}', data #>> '{address,zip}' from users;

-- @> and <@ (containment)
select id from orders where data @> '{"status": "active"}';

select id from orders where '{"status": "active"}' <@ data;

-- ? (key exists)
select id from events where data ? 'payload';

-- ?| (any key) and ?& (all keys)
select id from events where data ?| array['a', 'b'];

select id from events where data ?& array['a', 'b'];

-- Combined JSON path
select id, data -> 'user' ->> 'name' as user_name from events;
