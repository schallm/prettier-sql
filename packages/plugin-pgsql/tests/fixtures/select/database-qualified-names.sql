-- A name qualified with the (current) database: database.schema.table
select o.id, c.name from shop.sales.orders as o join shop.public.customers as c on c.id = o.customer_id;

insert into shop.sales.orders (id) values (1);

create table shop.sales.archive as select * from shop.sales.orders;

create sequence shop.sales.order_ids;

select * from "Shop DB".public."Orders";
