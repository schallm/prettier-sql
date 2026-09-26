-- WHERE CURRENT OF: only the row the cursor is on
update Books set Price = Price * 1.1 where current of BookCursor;

delete from Books where current of global BookCursor;
