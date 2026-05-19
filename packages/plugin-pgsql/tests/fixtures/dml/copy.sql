copy orders from '/tmp/orders.csv';

copy orders to '/tmp/orders.csv';

copy (select id from orders) to '/tmp/ids.csv';

-- COPY with options
copy orders from '/tmp/orders.csv' with (format csv, header true, delimiter ',', null '');

copy orders (id, customer_id, amount) to '/tmp/orders_partial.csv' with (format csv, header true);

-- COPY with QUOTE and ESCAPE
copy products from '/tmp/products.csv' with (format csv, quote '"', escape '\\');
