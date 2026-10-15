create table t (
    a int not null -- key
        constraint pk primary key, -- first
    b int, /* second */
    c int -- third
);

-- A table constraint written between columns stays there
create table Reservations (
    ReservationId int not null,
    constraint PK_Reservations primary key (ReservationId), -- one row per reservation
    BookId int not null -- the book reserved
);
