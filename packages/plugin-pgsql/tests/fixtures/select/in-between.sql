-- ANY with array literal (pgsql-specific)
select id, title from books where price = any (array[9.99, 19.99, 29.99]);

-- SIMILAR TO
select id, email from users where email similar to '%@(gmail|yahoo)\.com';

select id, email from users where email not similar to '%@(gmail|yahoo)\.com';
