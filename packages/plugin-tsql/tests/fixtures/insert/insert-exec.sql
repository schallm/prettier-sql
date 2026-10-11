-- INSERT ... EXECUTE takes the EXECUTE layout and keyword case
insert into t (a, b) exec dbo.p @x = 1, @y = 'z';

insert t execute ('select 1') at srv;
