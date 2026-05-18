select b.id, b.title, a.first_name, a.last_name from books as b inner join authors as a on b.author_id = a.id;

select b.title, a.first_name from books as b left join authors as a on b.author_id = a.id where a.id is null;

select b.title, a.first_name from books as b full join authors as a on b.author_id = a.id;
