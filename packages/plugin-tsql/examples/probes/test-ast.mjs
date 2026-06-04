import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const pluginMod = await import(join(__dirname, 'dist/index.js'));
const parser = (pluginMod.default ?? pluginMod).parsers?.tsql;

async function ast(sql) {
    const r = await parser.parse(sql, {}, {});
    return JSON.stringify(r, null, 2);
}

console.log('=== ENCRYPTED WITH ===');
const r1 = await ast(`create table dbo.T (
    Id int primary key,
    SSN nvarchar(11) encrypted with (
        column_encryption_key = MyCEK,
        encryption_type = deterministic,
        algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) null
);`);
// just show the columns part
const p1 = JSON.parse(r1);
const stmt1 = p1.props.batches[0].props.statements[0];
console.log(JSON.stringify(stmt1.props.columns, null, 2));

console.log('\n=== ALTER COLUMN ADD MASKED ===');
const r2 = await ast(`alter table dbo.Users alter column Phone add masked with (function = 'default()');`);
const p2 = JSON.parse(r2);
const stmt2 = p2.props.batches[0].props.statements[0];
console.log(JSON.stringify(stmt2.props, null, 2));

console.log('\n=== PK WITH FILLFACTOR ===');
const r3 = await ast(`create table dbo.T (
    Id int not null,
    constraint PK_T primary key clustered (Id) with (fillfactor = 90)
);`);
const p3 = JSON.parse(r3);
const stmt3 = p3.props.batches[0].props.statements[0];
console.log(JSON.stringify(stmt3.props.constraints, null, 2));
