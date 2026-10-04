alter database Sales modify filegroup Archive default;
go
alter database Sales modify filegroup Archive name = Archive2019;
go
alter database Sales modify filegroup Archive read_only with rollback immediate;
go
alter database Sales modify filegroup Archive readwrite with rollback after 30 seconds;
go
alter database Sales modify filegroup Archive autogrow_all_files with no_wait;
