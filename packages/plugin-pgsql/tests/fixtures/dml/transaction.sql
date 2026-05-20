-- Basic transaction control
begin;

commit;

rollback;

-- Named savepoints
savepoint sp1;

release savepoint sp1;

rollback to savepoint sp1;

-- SET TRANSACTION options
set transaction isolation level serializable;

set transaction read only;

set transaction read write, deferrable;

-- BEGIN with options
begin isolation level read committed;

begin read only;

-- Two-phase commit
prepare transaction 'txn-1234';

commit prepared 'txn-1234';

rollback prepared 'txn-1234';
