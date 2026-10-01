-- OPTION (...) query hints and table hints keep their names, values and identifier case
select a from dbo.t option (label = 'MyLabel')

select a from dbo.t option (min_grant_percent = 10, max_grant_percent = 20)

select a from dbo.t option (table hint (dbo.T, nolock), table hint (T, index (Ix)), table hint (dbo.t, forceseek (Ix (a))))

select a from dbo.t option (concat union, parameterization forced, no_performance_spool)

select a from dbo.t option (ignore_nonclustered_columnstore_index, use plan N'<x/>')

select a from dbo.t option (fast 10, maxdop 2, force order, optimize for (@a unknown, @b = 'X'))

select * from dbo.t with (spatial_window_max_cells = 10)

select * from dbo.t with (keepidentity, keepdefaults, ignore_constraints, ignore_triggers)

select * from dbo.t with (forceseek (Ix (a, b)), index (Ix1, Ix2))
