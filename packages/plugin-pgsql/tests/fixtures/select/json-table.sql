-- Basic JSON_TABLE with PATH columns and FOR ORDINALITY
select t.id, t.name, t.row_num
from documents,
json_table(documents.data, '$[*]'
    columns (
        id integer path '$.id',
        name text path '$.name',
        row_num for ordinality
    )
) as t;

-- JSON_TABLE with EXISTS column
select t.id, t.active
from events,
json_table(events.payload, '$'
    columns (
        id integer path '$.id',
        active boolean exists path '$.active'
    )
) as t;
