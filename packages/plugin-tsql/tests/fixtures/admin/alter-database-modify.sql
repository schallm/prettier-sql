-- Azure SQL: change the edition and service objective
alter database Sales modify (service_objective = 'S1');
go
alter database Sales modify (edition = 'Premium', maxsize = 500 gb, service_objective = 'P1');
go
alter database current modify (service_objective = 'HS_Gen5_8') with manual_cutover;
go
alter database Sales set recovery full;
