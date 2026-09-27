declare my_cursor cursor for select id, name from users;

declare scroll_cursor scroll cursor for select id from orders;

declare held_cursor scroll cursor with hold for select id from orders;

declare binary_cursor binary insensitive cursor for select id from orders;

declare asensitive_cursor asensitive cursor for select id from orders;

declare no_scroll_cursor no scroll cursor for select id from orders;

fetch next from my_cursor;

fetch 10 from my_cursor;

fetch all from my_cursor;

move prior from scroll_cursor;

close my_cursor;

close all;
