-- CREATE DATABASE with ON PRIMARY file spec — file group content must not be dropped

create database TestDb
    on primary (name = 'TestDb', filename = 'C:\data\TestDb.mdf', size = 100mb)
    log on (name = 'TestDb_log', filename = 'C:\data\TestDb_log.ldf', size = 10mb)
    collate Latin1_General_CI_AS
