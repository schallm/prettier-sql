-- REGEXP_LIKE — returns 1 if pattern matches
select regexp_like(Email, '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$') as IsValid
from Customers

-- REGEXP_COUNT — count occurrences of pattern
select regexp_count(Description, '\w+') as WordCount
from Products

-- REGEXP_REPLACE — replace pattern with string
select regexp_replace(Phone, '[^0-9]', '') as DigitsOnly
from Contacts

-- REGEXP_SUBSTR — return first matching substring
select regexp_substr(Email, '^[^@]+') as Username
from Customers

-- REGEXP_INSTR — return position of match
select regexp_instr(Email, '@') as AtPosition
from Customers

-- REGEXP_MATCHES — table-valued, returns matched substrings
select m.value
from Products
cross apply regexp_matches(Products.Description, '\b\w{5,}\b') as m

-- REGEXP_SPLIT_TO_TABLE — split string by regex delimiter
select s.value
from Products
cross apply regexp_split_to_table(Products.Tags, ',\s*') as s
