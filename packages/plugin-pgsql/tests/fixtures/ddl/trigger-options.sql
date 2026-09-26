-- UPDATE OF columns, function arguments, OR REPLACE, constraint triggers and transition tables
create trigger tr before update of a, "B" on t for each row when (old.a is distinct from new.a) execute function f();
create or replace trigger tr after insert or update of c or delete on s.t for each statement execute function audit('orders', 'it''s');
create constraint trigger ct after insert on t from u deferrable initially deferred for each row execute function check_fk();
create trigger tr after update on t referencing old table as old_rows new table as "New Rows" for each statement execute function f();
create trigger tr instead of delete on v for each row execute procedure f();
