-- Scratch file for manual T-SQL formatting tests.
-- Run: pnpm run format:sql   (from packages/plugin-tsql/)
select
    Id,
    Title,
    Price
from Books
where InStock = 1
order by Price desc;