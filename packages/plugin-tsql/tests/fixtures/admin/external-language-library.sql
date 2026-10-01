-- CREATE / ALTER EXTERNAL LANGUAGE and LIBRARY keep their FROM and WITH clauses
create external language l from (content = 'x', file_name = 'y')

create external language l from (content = 'x', file_name = 'y', platform = windows)

alter external language l set (content = 'x', file_name = 'y')

create external library l from (content = 'x') with (language = 'R')

alter external library l set (content = 'x') with (language = 'R')
