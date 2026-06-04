/**
 * Probe 50 — Edge cases in expressions, data types, and operators:
 *   - Bitwise operators (&, |, ^, ~)
 *   - Bitwise compound assignment (&=, |=, ^=)
 *   - Unary minus in expressions
 *   - Modulo operator (%)
 *   - String concatenation (+)
 *   - CONCAT function
 *   - AT TIME ZONE with variable
 *   - DATEADD / DATEDIFF with literal date parts
 *   - DATENAME / DATEPART
 *   - EOMONTH
 *   - DATEFROMPARTS / DATETIME2FROMPARTS
 *   - FORMAT function
 *   - Large numeric literals (bigint range)
 *   - Hex literals (0x...)
 *   - Binary literals (0x prefix)
 *   - Scientific notation literals
 *   - N'' empty string
 *   - Multi-line string (T-SQL doesn't support, but adjacent concat)
 *   - NEWID() / NEWSEQUENTIALID()
 *   - CHECKSUM / BINARY_CHECKSUM
 *   - HASHBYTES
 *   - COMPRESS / DECOMPRESS
 *   - OBJECT_ID / OBJECT_NAME / SCHEMA_ID / SCHEMA_NAME
 *   - TYPE_ID / TYPE_NAME
 *   - COL_LENGTH / COL_NAME
 *   - COLUMNPROPERTY
 *   - SERVERPROPERTY / DATABASEPROPERTY
 *   - @@ROWCOUNT / @@ERROR / @@IDENTITY / @@SPID / @@VERSION
 *   - @@SERVERNAME / @@SERVICENAME
 *   - XACT_STATE() / @@TRANCOUNT
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');

async function fmt(sql) {
    try {
        return await prettier.format(sql, {
            parser: 'tsql',
            plugins: [pluginPath],
            printWidth: 120,
        });
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function check(label, input, mustContain) {
    return { label, input, mustContain };
}

const cases = [
    // ── Bitwise operators ──────────────────────────────────────────────────────
    check(
        'bitwise_ops',
        `select Flags & 3, Flags | 1, Flags ^ 255, ~Flags from dbo.Config`,
        ['flags & 3', 'flags | 1', 'flags ^ 255', '~flags']
    ),
    check(
        'bitwise_compound',
        `declare @f int = 7; set @f &= 5; set @f |= 8; set @f ^= 3`,
        ['&=', '|=', '^=']
    ),

    // ── Arithmetic ────────────────────────────────────────────────────────────
    check(
        'modulo',
        `select OrderId % 10 as Bucket, -Amount as Debit from dbo.Orders`,
        ['% 10', 'bucket', '-amount', 'debit']
    ),
    check(
        'unary_minus',
        `select -1, -Amount, -(Price * Qty) from dbo.Items`,
        ['-1', '-amount', '-(price * qty)']
    ),

    // ── String concat ─────────────────────────────────────────────────────────
    check(
        'string_concat',
        `select FirstName + ' ' + LastName as FullName, concat(FirstName, ' ', LastName) as FullName2 from dbo.Customers`,
        ["firstname + ' ' + lastname", 'concat', 'fullname', 'fullname2']
    ),

    // ── Date functions ────────────────────────────────────────────────────────
    check(
        'dateadd_datediff',
        `select dateadd(month, -1, getdate()), datediff(day, OrderDate, getdate()) as DaysOld from dbo.Orders`,
        ['dateadd', 'month', '-1', 'getdate', 'datediff', 'day', 'orderdate', 'daysold']
    ),
    check(
        'datename_datepart',
        `select datename(weekday, OrderDate), datepart(hour, CreatedAt), datepart(quarter, OrderDate) from dbo.Orders`,
        ['datename', 'weekday', 'datepart', 'hour', 'quarter']
    ),
    check(
        'eomonth',
        `select eomonth(getdate()), eomonth(getdate(), 1) as NextMonthEnd`,
        ['eomonth', 'getdate', 'nextmonthend']
    ),
    check(
        'datefromparts',
        `select datefromparts(2024, 1, 15), datetime2fromparts(2024, 1, 15, 12, 30, 0, 0, 7)`,
        ['datefromparts', '2024', 'datetime2fromparts', '12', '30']
    ),
    check(
        'format_function',
        `select format(OrderDate, 'yyyy-MM-dd', 'en-US'), format(Amount, 'C2', 'en-US') from dbo.Orders`,
        ['format', 'orderdate', "'yyyy-mm-dd'", 'amount', "'c2'"]
    ),

    // ── Literals ──────────────────────────────────────────────────────────────
    check(
        'hex_literal',
        `select 0xFF, 0x1A2B3C4D, cast(0xDEADBEEF as bigint)`,
        ['0xff', '0x1a2b3c4d', '0xdeadbeef', 'bigint']
    ),
    check(
        'large_integer',
        `select 9223372036854775807 as MaxBigInt, -9223372036854775808 as MinBigInt`,
        ['9223372036854775807', '9223372036854775808']
    ),
    check(
        'scientific_notation',
        `select 1.5e10 as Big, 2.3e-4 as Small, cast(1e6 as decimal(18,2))`,
        ['1.5e', '2.3e-4', '1e6']
    ),

    // ── GUID / Hash functions ─────────────────────────────────────────────────
    check(
        'newid',
        `insert into dbo.Entity (Id, Name) values (newid(), 'Test')`,
        ['newid', 'entity', "'test'"]
    ),
    check(
        'hashbytes',
        `select hashbytes('SHA2_256', cast(OrderId as nvarchar(20))) as Hash from dbo.Orders`,
        ['hashbytes', "'sha2_256'", 'hash']
    ),
    check(
        'checksum',
        `select checksum(OrderId, Amount, Status), binary_checksum(*) from dbo.Orders`,
        ['checksum', 'orderid', 'amount', 'binary_checksum']
    ),

    // ── Object/schema metadata functions ─────────────────────────────────────
    check(
        'object_id_name',
        `select object_id('dbo.Orders'), object_name(object_id('dbo.Orders')), schema_id('dbo'), schema_name(schema_id('dbo'))`,
        ['object_id', 'object_name', 'schema_id', 'schema_name', 'dbo.orders']
    ),
    check(
        'serverproperty',
        `select serverproperty('Edition'), serverproperty('ProductVersion'), serverproperty('Collation')`,
        ['serverproperty', "'edition'", "'productversion'", "'collation'"]
    ),

    // ── System variables ──────────────────────────────────────────────────────
    check(
        'system_vars',
        `select @@rowcount, @@error, @@identity, @@spid, @@servername, @@version`,
        ['@@rowcount', '@@error', '@@identity', '@@spid', '@@servername', '@@version']
    ),
    check(
        'trancount_xact',
        `if @@trancount > 0 begin if xact_state() = 1 commit transaction else rollback transaction end`,
        ['@@trancount', 'xact_state', 'commit transaction', 'rollback transaction']
    ),

    // ── AT TIME ZONE ──────────────────────────────────────────────────────────
    check(
        'at_time_zone',
        `select OrderDate at time zone 'UTC' at time zone 'Pacific Standard Time' as PacificDate from dbo.Orders`,
        ['at time zone', "'utc'", "'pacific standard time'", 'pacificdate']
    ),

    // ── COMPRESS / DECOMPRESS ─────────────────────────────────────────────────
    check(
        'compress_decompress',
        `select compress(cast(Payload as nvarchar(max))), cast(decompress(CompressedData) as nvarchar(max)) from dbo.Events`,
        ['compress', 'decompress', 'compresseddata', 'payload']
    ),

    // ── COL_LENGTH / COL_NAME ─────────────────────────────────────────────────
    check(
        'col_length_name',
        `select col_length('dbo.Orders', 'Status'), col_name(object_id('dbo.Orders'), 1)`,
        ['col_length', 'col_name', 'dbo.orders', 'status']
    ),
];

let pass = 0;
let fail = 0;
const failures = [];

for (const { label, input, mustContain } of cases) {
    const out = await fmt(input);
    const outNorm = normalize(out);
    const missing = mustContain.filter(kw => !outNorm.includes(kw.toLowerCase()));
    if (missing.length === 0) {
        pass++;
    } else {
        fail++;
        failures.push({ label, input, out: out.trim(), missing });
    }
}

console.log(`\nProbe 50 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
