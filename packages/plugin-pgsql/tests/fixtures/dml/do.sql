-- DO block with plpgsql (body preserved as-is)
do $$
BEGIN
  RAISE NOTICE 'hello world';
END
$$ language plpgsql;

-- DO block with sql language
do $$
  insert into audit_log (action) values ('startup')
$$ language sql;
