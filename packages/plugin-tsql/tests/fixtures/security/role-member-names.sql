-- Names that need brackets keep them
alter role r add member [d\u]

alter role r drop member [x y]

create login [d\u] from windows

drop database [a b]

create user [d\u] for login [d\u]

update statistics dbo.t ([my stat])
