select id, title from books where title like 'The%';

select id, title from books where title not like 'The%';

select id, email from users where email ilike '%@example.com';

select id, email from users where email not ilike '%@example.com';
