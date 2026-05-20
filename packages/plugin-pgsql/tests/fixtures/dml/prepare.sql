prepare get_user(integer) as select id, name from users where id = $1;

execute get_user(42);

deallocate get_user;

deallocate all;
