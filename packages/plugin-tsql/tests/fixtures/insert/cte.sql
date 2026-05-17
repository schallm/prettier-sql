with src as (select Id, Title from StagingBooks) insert into Books (Id, Title) select Id, Title from src
