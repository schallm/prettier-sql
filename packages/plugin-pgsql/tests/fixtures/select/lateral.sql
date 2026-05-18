select b.id, r.avg_price from books as b, lateral (select avg(price) as avg_price from books where author_id = b.author_id) as r;
