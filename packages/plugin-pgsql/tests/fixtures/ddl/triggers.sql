-- BEFORE INSERT trigger
create trigger check_before_insert
before insert on accounts
for each row
execute function check_account_insert();

-- AFTER UPDATE trigger
create trigger log_update
after update on accounts
for each statement
execute function log_account_change();

-- BEFORE INSERT OR UPDATE
create trigger validate_order
before insert or update on orders
for each row
execute function validate_order_data();
