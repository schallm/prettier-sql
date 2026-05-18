select json_query(data, '$.name')
from events;

select json_exists(data, '$.active')
from events;

select json_value(data, '$.price' returning numeric)
from events;
