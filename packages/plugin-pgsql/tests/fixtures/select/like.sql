select id, email from users where email ilike '%@example.com';

select id, email from users where email not ilike '%@example.com';

-- Multiple predicates combined
select id, title from books where title ilike '%postgres%' and isbn not like '978-0%';
