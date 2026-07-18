create column master key CMK1 with (key_store_provider_name = 'MSSQL_CERTIFICATE_STORE', key_path = 'CurrentUser/My/abc');

create column encryption key CEK1 with values (column_master_key = CMK1, algorithm = 'RSA_OAEP', encrypted_value = 0xABCD1234);

alter column encryption key CEK1 add value (column_master_key = CMK2, algorithm = 'RSA_OAEP', encrypted_value = 0xEF01);

alter column encryption key CEK1 drop value (column_master_key = CMK2);

drop column encryption key CEK1;

drop column master key CMK1;

create table dbo.patients (
  id int not null,
  ssn char(9) collate Latin1_General_BIN2 encrypted with (column_encryption_key = CEK1, encryption_type = deterministic, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256') not null
);
