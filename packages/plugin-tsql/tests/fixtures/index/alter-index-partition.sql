-- ALTER INDEX REBUILD with PARTITION = n — must come before WITH (...)
alter index IX_Orders on dbo.Orders
    rebuild partition = 3
    with (data_compression = row, online = on)

-- ALTER INDEX REBUILD with PARTITION ALL
alter index IX_Orders on dbo.Orders
    rebuild partition = all
    with (data_compression = page)
