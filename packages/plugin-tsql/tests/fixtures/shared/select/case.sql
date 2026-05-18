select id, case when price < 10 then 'Budget' when price < 30 then 'Mid' else 'Premium' end as tier from books;

select id, case genre_id when 1 then 'Fiction' when 2 then 'Non-Fiction' else 'Other' end as genre from books;
