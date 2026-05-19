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

-- Trigger with WHEN condition
create trigger audit_price_change
before update on products
for each row
when (old.price is distinct from new.price)
execute function audit_price();

-- AFTER DELETE
create trigger cleanup_orphans
after delete on orders
for each row
execute function cleanup_order_items();

-- INSTEAD OF trigger on view
create trigger view_insert
instead of insert on v_active_users
for each row
execute function handle_view_insert();

-- CONSTRAINT trigger
create constraint trigger check_fk
after insert on order_items
deferrable initially deferred
for each row
execute function check_order_item_fk();
