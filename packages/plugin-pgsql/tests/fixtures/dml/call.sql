-- Simple procedure call
call process_orders();

-- Call with arguments
call update_inventory(product_id => 42, delta => -5);

-- Call with positional args
call send_notification(1, 'hello', true);
