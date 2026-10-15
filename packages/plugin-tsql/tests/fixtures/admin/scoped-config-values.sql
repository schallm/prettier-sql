-- A scoped configuration option ScriptDom doesn't know keeps a signed value
alter database scoped configuration set new_option = -10;
alter database scoped configuration for secondary set maxdop = 4;
