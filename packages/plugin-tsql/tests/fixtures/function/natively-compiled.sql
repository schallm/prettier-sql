-- Natively compiled scalar function — BEGIN ATOMIC WITH (...) must be preserved
-- without an extra BEGIN/END wrapping it.
create function f () returns int
with native_compilation, schemabinding
as
begin atomic with (transaction isolation level = snapshot, language = N'us_english')
  return 1
end
