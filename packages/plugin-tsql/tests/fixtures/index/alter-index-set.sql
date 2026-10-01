-- ALTER INDEX ... SET takes its options without WITH
alter index ix on dbo.t set (allow_row_locks = off)

alter index ix on dbo.t set (allow_row_locks = on, allow_page_locks = off)

alter index ix on dbo.t rebuild with (online = on)
