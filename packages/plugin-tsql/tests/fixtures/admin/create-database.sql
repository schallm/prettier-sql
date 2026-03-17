create database SalesDB

create database SalesDB collate Latin1_General_CI_AS

create database SalesSnap as snapshot of SalesDB

drop database SalesDB

drop database if exists SalesDB
