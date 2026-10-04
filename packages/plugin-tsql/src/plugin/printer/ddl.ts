import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import {
    keyword,
    hardline,
    join,
    indent,
    group,
    softline,
    line,
    ifExistsDoc,
    commentsBlock,
    parenList,
    optionItems,
    parenItems,
    willBreak,
} from '@prettier-sql/core/printer/utils';
import { createIndexDoc, alterTableDoc, constraintDoc, checkDoc, optionLinesDoc, asQueryDoc, dropDoc } from '@prettier-sql/core/printer/layout';
import { prop, propArr, propStr, propBool, propStrArr, schemaObjectName, builtinTypeDoc, printDropSingleObject, withTrailingComment, splitTopLevel, sortOrderDoc } from './helpers.js';
// printNode / printBool / qexpr / printStatementWithComments are imported from statements.ts
// — circular but safe in ESM (all imports are function references, never accessed during init)
import { joinBodyStatements, printSelectBody, printNode, printBool, printBoolClause, qexpr, printCtes, printStatement } from './statements.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * When ScriptDOM sees `AS BEGIN...END` it wraps the body in a single
 * BeginEndBlockStatement. Unwrap that one outer block so that proc/function/
 * trigger printers can emit their own BEGIN/END delimiters cleanly, while
 * a *standalone* BEGIN...END statement still prints with its own delimiters.
 */
function unwrapBodyBlock(stmts: SqlNode[]): SqlNode[] {
    if (stmts.length === 1 && stmts[0]?.type === 'BeginEndBlock') {
        return propArr(stmts[0]!, 'statements');
    }
    return stmts;
}

/** Render ` NULL` / ` NOT NULL` from a tristate `nullable` prop value. */
function nullablePart(nullable: unknown, opts: Options): Doc {
    if (nullable === true) return [' ', keyword('NULL', opts)];
    if (nullable === false) return [' ', keyword('NOT NULL', opts)];
    return '';
}

/**
 * Render a `WITH opt1, opt2, ...` clause where each option is keyword-cased.
 * Stays inline when it fits; breaks one-per-line under WITH otherwise.
 * Returns an empty string when no options are supplied.
 */
function withOptionsClause(options: string[] | null | undefined, opts: Options): Doc {
    if (!options?.length) return '';
    return group([
        keyword('WITH', opts),
        indent([
            line,
            join(
                [',', line],
                options.map((o) => statisticsOption(o, opts)),
            ),
        ]),
    ]);
}

/** NAME = value: the name is a keyword; a value other than ON / OFF (0x01 in STATS_STREAM) is kept as written. */
function statisticsOption(option: string, opts: Options): Doc {
    const m = /^([A-Z_]+) = (.*)$/i.exec(option);
    if (!m) return keyword(option, opts);
    return [keyword(m[1]!, opts), ' = ', /^(ON|OFF)$/i.test(m[2]!) ? keyword(m[2]!, opts) : m[2]!];
}

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

/** Inline INDEX definition within CREATE TABLE body. */
export function printInlineIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName') ?? '';
    const isUnique = node.props?.['unique'];
    const kind = propStr(node, 'kind'); // 'clustered', 'nonclustered', etc.
    const columns = propArr(node, 'columns');
    const includeColumns = propStrArr(node, 'includeColumns');
    const filterPredicateNode = prop(node, 'filterPredicate');
    const indexOptions = propStrArr(node, 'indexOptions');

    const uniqueKw: Doc = isUnique ? [' ', keyword('UNIQUE', opts)] : '';
    const kindKw: Doc = kind ? [' ', keyword(kind.toUpperCase(), opts)] : '';

    const colDocs = columns.map((c) => {
        const colName = propStr(c, 'name') ?? '';
        return [colName, sortOrderDoc(propStr(c, 'sortOrder'), opts)];
    });

    const includePart: Doc = includeColumns.length
        ? [' ', keyword('INCLUDE', opts), ' ', parenList(includeColumns)]
        : '';
    const filterPart: Doc = filterPredicateNode ? [' ', printBoolClause('WHERE', filterPredicateNode, opts)] : '';
    const withPart: Doc = indexOptions.length ? [' ', keyword('WITH', opts), ' ', optionItems(indexOptions, opts)] : '';

    return [
        keyword('INDEX', opts),
        ' ',
        indexName,
        uniqueKw,
        kindKw,
        // A column-level index has no column list: it indexes its column
        colDocs.length > 0 ? [' ', parenList(colDocs as Doc[])] : '',
        includePart,
        filterPart,
        withPart,
        storageClause(node.props, opts),
    ];
}

export function printCreateTable(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const options = propStrArr(node, 'options');
    const systemTimePeriod = node.props?.['systemTimePeriod'] as
        | { startColumn: string; endColumn: string }
        | null
        | undefined;

    const indexes = propArr(node, 'indexes');
    const allDefs: Doc[] = [
        ...columns.map((col) => withTrailingComment(col, printColumnDef(col, opts))),
        ...constraints.map((c) => withTrailingComment(c, printConstraintDef(c, opts))),
        ...indexes.map((idx) => withTrailingComment(idx, printInlineIndex(idx, opts))),
    ];

    // PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo) — always last in the table body
    if (systemTimePeriod) {
        allDefs.push([
            keyword('PERIOD FOR SYSTEM_TIME', opts),
            ' (',
            systemTimePeriod.startColumn,
            ', ',
            systemTimePeriod.endColumn,
            ')',
        ]);
    }

    const withPart: Doc =
        options && options.length > 0 ? [hardline, keyword('WITH', opts), ' ', optionItems(options.map(nestedOptionDoc), opts)] : '';
    const onFileGroup = propStr(node, 'onFileGroup');
    const textimageOn = propStr(node, 'textimageOn');
    const fileStreamOn = propStr(node, 'fileStreamOn');
    const onPart: Doc = onFileGroup ? [hardline, keyword('ON', opts), ' ', onFileGroup] : '';
    const textimagePart: Doc = textimageOn ? [hardline, keyword('TEXTIMAGE_ON', opts), ' ', textimageOn] : '';
    const fileStreamPart: Doc = fileStreamOn ? [hardline, keyword('FILESTREAM_ON', opts), ' ', fileStreamOn] : '';
    // CREATE TABLE t [(col, ...)] [WITH (...)] AS SELECT ... (CTAS)
    const ctasSelect = prop(node, 'ctasSelect');
    if (ctasSelect) {
        const ctasColumns = propStrArr(node, 'ctasColumns');
        return group([
            asQueryDoc(
                [keyword('CREATE TABLE', opts), ' ', schemaObjectName(prop(node, 'name')), ctasColumns.length ? [' ', parenList(ctasColumns)] : '', withPart],
                keyword('AS', opts),
                printSelectBody(ctasSelect, opts),
            ),
            ';',
        ]);
    }
    // Graph table types (AS NODE / AS EDGE)
    const asNode = node.props?.['asNode'] as boolean | undefined;
    const asEdge = node.props?.['asEdge'] as boolean | undefined;
    const graphPart: Doc = asNode
        ? [' ', keyword('AS NODE', opts)]
        : asEdge
          ? [' ', keyword('AS EDGE', opts)]
          : '';
    // AS FILETABLE has no column list; FEDERATED ON (distribution = column) follows it
    const asFileTable = propBool(node, 'asFileTable');
    const federatedOn = propStr(node, 'federatedOn');
    return group([
        keyword('CREATE TABLE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        asFileTable
            ? [' ', keyword('AS FILETABLE', opts)]
            : [' (', indent([hardline, join([',', hardline], allDefs)]), hardline, ')'],
        federatedOn ? [hardline, keyword('FEDERATED ON', opts), ' (', federatedOn, ')'] : '',
        graphPart,
        onPart,
        fileStreamPart,
        textimagePart,
        withPart,
        ';',
    ]);
}

/**
 * A pre-serialized table option, `name = on (a = x, b = y (c = z))`: printed as written, with the
 * parenthesized part (after a space, so a call like `dbo.fn(a)` isn't one) broken one item per line
 * when it doesn't fit.
 */
function nestedOptionDoc(text: string): Doc {
    const open = text.search(/ \(/);
    if (open < 0 || !text.endsWith(')')) return text;
    const items = splitTopLevel(text.slice(open + 2, -1));
    return [text.slice(0, open), ' ', group(['(', indent([softline, join([',', line], items.map(nestedOptionDoc))]), softline, ')'])];
}

/** ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ..., ENCRYPTION_TYPE = ..., ALGORITHM = '...') */
function encryptedWithDoc(
    encryption: { columnEncryptionKey?: string; encryptionType?: string; algorithm?: string },
    opts: Options,
): Doc {
    const encParts: Doc[] = [];
    if (encryption.columnEncryptionKey)
        encParts.push([keyword('COLUMN_ENCRYPTION_KEY', opts), ' = ', encryption.columnEncryptionKey]);
    if (encryption.encryptionType)
        encParts.push([keyword('ENCRYPTION_TYPE', opts), ' = ', keyword(encryption.encryptionType, opts)]);
    if (encryption.algorithm) encParts.push([keyword('ALGORITHM', opts), ' = ', encryption.algorithm]);
    return [keyword('ENCRYPTED WITH', opts), ' ', optionItems(encParts, opts)];
}

/** The keywords after GENERATED ALWAYS AS for a GeneratedAlwaysType name. */
function generatedAlwaysKeyword(generatedAlways: string): string {
    const gaMap: Record<string, string> = {
        RowStart: 'ROW START',
        RowEnd: 'ROW END',
        UserIdStart: 'SUSER_SID START',
        UserIdEnd: 'SUSER_SID END',
        UserNameStart: 'SUSER_SNAME START',
        UserNameEnd: 'SUSER_SNAME END',
        TransactionIdStart: 'TRANSACTION_ID START',
        TransactionIdEnd: 'TRANSACTION_ID END',
        SequenceNumberStart: 'SEQUENCE_NUMBER START',
        SequenceNumberEnd: 'SEQUENCE_NUMBER END',
    };
    return gaMap[generatedAlways] ?? generatedAlways.toUpperCase();
}

export function printColumnDef(node: SqlNode, opts: Options): Doc {
    // Raw leaf (e.g. ENCRYPTED WITH — property names vary across ScriptDOM versions).
    // The C# AstBuilder emits `Leaf("ColumnDefinition", col, rawText)` which sets
    // `node.text` to the original column fragment and leaves `node.props` undefined.
    if (!node.props) return node.text ?? '/* column */';

    const name = propStr(node, 'name') ?? 'col';

    // Computed column: Name AS expression [PERSISTED] [NOT NULL|NULL]
    const computedExpr = prop(node, 'computedExpression');
    if (computedExpr) {
        const isPersisted = node.props?.['isPersisted'] as boolean | undefined;
        // Computed PERSISTED columns may have an explicit nullability constraint
        const computedNullPart = nullablePart(node.props?.['nullable'], opts);
        return [
            name,
            ' ',
            keyword('AS', opts),
            ' ',
            printNode(computedExpr, opts),
            isPersisted ? [' ', keyword('PERSISTED', opts)] : '',
            computedNullPart,
        ];
    }

    const dataType = propStr(node, 'dataType') ?? 'INT';
    // A user-defined type is an identifier: keep its case
    const isUdtType = propBool(node, 'isUdt');
    const params = node.props?.['dataTypeParams'];
    const xmlSchemaCollection = propStr(node, 'xmlSchemaCollection');
    const xmlTypeOption = propStr(node, 'xmlTypeOption');
    // Read nullable as a tristate (true/false/undefined) — propBool only returns true/false.
    const isNullable = node.props?.['nullable'];
    const isIdentity = propBool(node, 'identity');
    const identitySeed = propStr(node, 'identitySeed');
    const identityIncrement = propStr(node, 'identityIncrement');
    const defaultValue = prop(node, 'defaultValue');
    const checkConstraint = prop(node, 'checkConstraint');
    const collation = propStr(node, 'collation');

    const typeStr: Doc = (() => {
        const baseType = isUdtType ? dataType : keyword(dataType, opts);
        if (Array.isArray(params) && params.length > 0) {
            return [baseType, `(${(params as string[]).join(', ')})`] as Doc;
        }
        if (xmlSchemaCollection) {
            // xml(CONTENT|DOCUMENT schema_collection) — CONTENT/DOCUMENT are optional keywords
            const prefix = xmlTypeOption ? `${keyword(xmlTypeOption, opts)} ` : '';
            return [baseType, '(', prefix, xmlSchemaCollection, ')'] as Doc;
        }
        return baseType;
    })();

    const parts: Doc[] = [name, ' ', typeStr];

    // COLLATE clause comes right after the data type
    if (collation) parts.push(' ', keyword('COLLATE', opts), ' ', collation);
    // Everything after the name, type and collation is a clause; clauses wrap onto indented
    // lines of their own when the definition doesn't fit
    const headLength = parts.length;

    // Always Encrypted: ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ..., ENCRYPTION_TYPE = ..., ALGORITHM = '...')
    const encryption = node.props?.['encryption'] as
        | { columnEncryptionKey?: string; encryptionType?: string; algorithm?: string }
        | null
        | undefined;
    if (encryption) {
        parts.push(line, encryptedWithDoc(encryption, opts));
    }

    if (isIdentity) {
        // A bare IDENTITY stays bare; IDENTITY(seed, increment) needs both
        if (identitySeed == null && identityIncrement == null) parts.push(line, keyword('IDENTITY', opts));
        else parts.push(line, keyword('IDENTITY', opts), `(${identitySeed ?? '1'}, ${identityIncrement ?? '1'})`);
        if (node.props?.['identityNotForReplication']) parts.push(line, keyword('NOT FOR REPLICATION', opts));
    }
    if (node.props?.['isRowGuidCol']) parts.push(line, keyword('ROWGUIDCOL', opts));
    // SPARSE / FILESTREAM / COLUMN_SET
    if (node.props?.['isSparse']) parts.push(line, keyword('SPARSE', opts));
    if (node.props?.['isFileStream']) parts.push(line, keyword('FILESTREAM', opts));
    if (node.props?.['isColumnSet']) parts.push(line, keyword('COLUMN_SET FOR ALL_SPARSE_COLUMNS', opts));

    // Temporal table: GENERATED ALWAYS AS ROW START / ROW END [HIDDEN]
    const generatedAlways = propStr(node, 'generatedAlways');
    if (generatedAlways) {
        const gaKw = generatedAlwaysKeyword(generatedAlways);
        parts.push(line, keyword('GENERATED ALWAYS AS', opts), ' ', keyword(gaKw, opts));
    }
    if (node.props?.['isHidden']) parts.push(line, keyword('HIDDEN', opts));

    // Dynamic data masking
    if (node.props?.['isMasked']) {
        const maskFn = propStr(node, 'maskingFunction') ?? 'default()';
        parts.push(line, keyword('MASKED WITH', opts), ' (', keyword('FUNCTION', opts), ` = '${maskFn.replace(/'/g, "''")}')`);
    }

    // NULL / NOT NULL and DEFAULT, in the order they were written
    const nullDoc: Doc[] = isNullable === true ? [line, keyword('NULL', opts)] : isNullable === false ? [line, keyword('NOT NULL', opts)] : [];
    const nullBeforeDefault = propBool(node, 'nullBeforeDefault');
    if (nullBeforeDefault) parts.push(...nullDoc);
    if (defaultValue) {
        const defaultName = propStr(node, 'defaultConstraintName');
        const defaultNamePrefix: Doc = defaultName ? [keyword('CONSTRAINT', opts), ' ', defaultName, ' '] : '';
        parts.push(line, defaultNamePrefix, keyword('DEFAULT', opts), ' ', printNode(defaultValue, opts));
        if (propBool(node, 'defaultWithValues')) parts.push(line, keyword('WITH VALUES', opts));
    }
    if (!nullBeforeDefault) parts.push(...nullDoc);
    if (checkConstraint) {
        const checkKw: Doc = [keyword('CHECK', opts), propBool(node, 'checkNotForReplication') ? [' ', keyword('NOT FOR REPLICATION', opts)] : ''];
        // A trailing comment on the condition breaks the parentheses, so `)` lands after it
        const check = checkDoc(checkKw, printBool(checkConstraint, opts, true));
        parts.push(line, constraintDoc(propStr(node, 'checkConstraintName'), [check], opts));
    }

    // Inline PRIMARY KEY / UNIQUE constraint (e.g. in table variable declarations)
    const uniqueConstraint = node.props?.['uniqueConstraint'] as
        | { constraintName?: string; isPrimaryKey: boolean; clustered: boolean | null; hash?: boolean; notEnforced?: boolean }
        | null
        | undefined;
    if (uniqueConstraint) {
        const constraintNamePrefix: Doc = uniqueConstraint.constraintName
            ? [keyword('CONSTRAINT', opts), ' ', uniqueConstraint.constraintName, ' ']
            : '';
        const uqKw = uniqueConstraint.isPrimaryKey ? keyword('PRIMARY KEY', opts) : keyword('UNIQUE', opts);
        const clusteredKw: Doc =
            uniqueConstraint.clustered === true
                ? [' ', keyword('CLUSTERED', opts)]
                : uniqueConstraint.clustered === false
                  ? [' ', keyword('NONCLUSTERED', opts)]
                  : '';
        const hashKw: Doc = uniqueConstraint.hash ? [' ', keyword('NONCLUSTERED HASH', opts)] : '';
        const uqOptions = (uniqueConstraint as { indexOptions?: string[] }).indexOptions ?? [];
        parts.push(
            line, constraintNamePrefix, uqKw, clusteredKw, hashKw,
            uqOptions.length > 0 ? [' ', keyword('WITH', opts), ' ', optionItems(uqOptions, opts)] : '',
            storageClause(uniqueConstraint as Record<string, unknown>, opts),
            notEnforcedDoc(uniqueConstraint.notEnforced, opts),
        );
    }

    // Inline REFERENCES (column-level foreign key: col type [CONSTRAINT name] REFERENCES Table(col))
    const foreignKey = node.props?.['foreignKey'] as
        | {
              constraintName?: string;
              refTable: SqlNode | null;
              refColumns?: string[];
              deleteAction?: string;
              updateAction?: string;
              notForReplication?: boolean;
              notEnforced?: boolean;
          }
        | null
        | undefined;
    if (foreignKey) {
        const refCols = foreignKey.refColumns ?? [];
        const references: Doc = [keyword('REFERENCES', opts), ' ', schemaObjectName(foreignKey.refTable), refCols.length ? [' ', parenItems(refCols, opts)] : ''];
        const clauses = [
            references,
            ...referentialActions(foreignKey.updateAction, foreignKey.deleteAction, foreignKey.notForReplication, opts),
            ...(foreignKey.notEnforced ? [keyword('NOT ENFORCED', opts)] : []),
        ];
        parts.push(line, constraintDoc(foreignKey.constraintName ?? null, clauses, opts));
    }

    // Column-level INDEX ix [CLUSTERED | NONCLUSTERED]
    const columnIndex = prop(node, 'index');
    if (columnIndex) parts.push(line, printInlineIndex(columnIndex, opts));
    const tail = parts.slice(headLength);
    // A clause with a forced break (a comment inside a CHECK) keeps the clauses inline
    if (willBreak(tail)) return [parts.slice(0, headLength), ...tail.map((d) => (d === line ? ' ' : d))];
    return group([parts.slice(0, headLength), indent(tail)]);
}

/** ON filegroup | scheme(column) [FILESTREAM_ON ...]: where an index or constraint is stored. */
function storageClause(props: Record<string, unknown> | undefined, opts: Options): Doc {
    const on = props?.['onFileGroup'] as string | undefined;
    const fileStream = props?.['fileStreamOn'] as string | undefined;
    return [
        on ? [' ', keyword('ON', opts), ' ', on] : '',
        fileStream ? [' ', keyword('FILESTREAM_ON', opts), ' ', fileStream] : '',
    ];
}

/** NOT ENFORCED (Azure Synapse, Fabric): always the last thing in a key. */
function notEnforcedDoc(notEnforced: boolean | undefined, opts: Options): Doc {
    return notEnforced ? [' ', keyword('NOT ENFORCED', opts)] : '';
}

/** ON UPDATE / ON DELETE actions and NOT FOR REPLICATION, the clauses that end a foreign key. */
function referentialActions(update: string | null | undefined, del: string | null | undefined, nfr: boolean | undefined, opts: Options): Doc[] {
    // SetNull → SET NULL, NoAction → NO ACTION
    const action = (a: string): Doc => keyword(a.replace(/([A-Z])/g, ' $1').trim().toUpperCase(), opts);
    return [
        update ? [keyword('ON UPDATE', opts), ' ', action(update)] : '',
        del ? [keyword('ON DELETE', opts), ' ', action(del)] : '',
        nfr ? keyword('NOT FOR REPLICATION', opts) : '',
    ].filter((d) => d !== '');
}

export function printConstraintDef(node: SqlNode, opts: Options): Doc {
    const constraintName = propStr(node, 'constraintName');
    const namePrefix: Doc = constraintName ? [keyword('CONSTRAINT', opts), ' ', constraintName, ' '] : '';

    switch (node.type) {
        case 'UniqueConstraint': {
            const isPK = propBool(node, 'isPrimaryKey');
            const clustered = node.props?.['clustered'] as boolean | null | undefined;
            // Only emit CLUSTERED/NONCLUSTERED when explicitly specified in DDL
            const clusteredKw: Doc =
                clustered === true
                    ? [keyword('CLUSTERED', opts), ' ']
                    : clustered === false
                      ? [keyword('NONCLUSTERED', opts), ' ']
                      : '';
            const kw = isPK ? keyword('PRIMARY KEY', opts) : keyword('UNIQUE', opts);
            // NONCLUSTERED HASH: a hash index on a memory-optimized table
            const hashKw: Doc = propBool(node, 'hash') ? [keyword('NONCLUSTERED HASH', opts), ' '] : '';
            // Columns are now {name, order} objects; fall back to plain strings for compat
            const rawCols = Array.isArray(node.props?.['columns']) ? node.props!['columns'] : [];
            const colDocs: Doc[] = (rawCols as Array<{ name: string; order: string } | string>).map((c) => {
                if (typeof c === 'string') return c;
                const dir = sortOrderDoc(c.order, opts);
                return [c.name, dir] as Doc;
            });
            const indexOptions = propStrArr(node, 'indexOptions');
            const withPart: Doc = indexOptions.length
                ? [' ', keyword('WITH', opts), ' ', optionItems(indexOptions, opts)]
                : '';
            return [
                namePrefix, kw, ' ', clusteredKw, hashKw, parenItems(colDocs, opts), withPart, storageClause(node.props, opts),
                notEnforcedDoc(propBool(node, 'notEnforced'), opts),
            ];
        }
        case 'DefaultConstraint': {
            const expr = prop(node, 'expression');
            return [
                namePrefix, keyword('DEFAULT', opts), ' ', expr ? printNode(expr, opts) : '',
                ' ', keyword('FOR', opts), ' ', propStr(node, 'column') ?? '',
                propBool(node, 'withValues') ? [' ', keyword('WITH VALUES', opts)] : '',
            ];
        }
        case 'CheckConstraint': {
            const expr = prop(node, 'expression');
            const checkKw: Doc = [keyword('CHECK', opts), propBool(node, 'notForReplication') ? [' ', keyword('NOT FOR REPLICATION', opts)] : ''];
            // A trailing comment on the condition breaks the parentheses, so `)` lands after it
            return constraintDoc(constraintName, [checkDoc(checkKw, expr ? printBool(expr, opts, true) : '')], opts);
        }
        case 'ForeignKeyConstraint': {
            const cols = propStrArr(node, 'columns');
            const refCols = propStrArr(node, 'refColumns');
            const refTable = prop(node, 'refTable');
            const refName = refTable ? schemaObjectName(refTable) : '';
            return constraintDoc(constraintName, [
                [keyword('FOREIGN KEY', opts), ' ', parenItems(cols, opts)],
                [keyword('REFERENCES', opts), ' ', refName, refCols.length ? [' ', parenItems(refCols, opts)] : ''],
                ...referentialActions(propStr(node, 'updateAction'), propStr(node, 'deleteAction'), propBool(node, 'notForReplication'), opts),
                ...(propBool(node, 'notEnforced') ? [keyword('NOT ENFORCED', opts)] : []),
            ], opts);
        }
        default:
            return node.text ?? `/* constraint: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// ALTER TABLE
// ---------------------------------------------------------------------------

export function printAlterTable(node: SqlNode, opts: Options): Doc {
    const alterType = propStr(node, 'alterType') ?? '';
    const name = schemaObjectName(prop(node, 'name'));
    const alter = (action: Doc): Doc => alterTableDoc([keyword('ALTER TABLE', opts), ' ', name], [action], opts);

    if (alterType === 'AlterTableAddTableElementStatement') {
        const withCheck = propStr(node, 'withCheckEnforcement');
        const withCheckPrefix: Doc =
            withCheck === 'Check'
                ? [keyword('WITH CHECK', opts), hardline]
                : withCheck === 'NoCheck'
                  ? [keyword('WITH NOCHECK', opts), hardline]
                  : '';
        const defs = [
            ...propArr(node, 'columns').map((c) => withTrailingComment(c, printColumnDef(c, opts))),
            ...propArr(node, 'constraints').map((c) => withTrailingComment(c, printConstraintDef(c, opts))),
            ...propArr(node, 'indexes').map((i) => withTrailingComment(i, printInlineIndex(i, opts))),
        ];
        const period = propStr(node, 'systemTimePeriod');
        if (period) defs.push([keyword('PERIOD FOR SYSTEM_TIME', opts), ' (', period, ')']);
        const addPart: Doc = defs.length === 1 ? [' ', defs[0]!] : indent([hardline, join([',', hardline], defs)]);
        return alter([withCheckPrefix, keyword('ADD', opts), addPart]);
    }

    if (alterType === 'AlterTableDropTableElementStatement') {
        const elements = (node.props?.['elements'] ?? []) as Array<{
            name?: string;
            elementType: string;
            ifExists: boolean;
            dropOptions?: string[];
        }>;
        // One DROP can mix kinds — DROP CONSTRAINT a, COLUMN IF EXISTS b — and a bare name
        // (NotSpecified) takes the kind of the name before it, or is a constraint when first.
        // So print each keyword where it was written: printing only the first element's
        // keyword turned `COLUMN IF EXISTS b` into a constraint named b.
        const kindKw: Record<string, string> = {
            Constraint: 'CONSTRAINT',
            Column: 'COLUMN',
            Index: 'INDEX',
            // DROP PERIOD FOR SYSTEM_TIME names nothing after it
            Period: 'PERIOD FOR SYSTEM_TIME',
        };
        const itemKw = (e: (typeof elements)[number]): string | null => {
            const kw = kindKw[e.elementType];
            return kw ? (e.ifExists ? `${kw} IF EXISTS` : kw) : null;
        };
        const itemDocs: Doc[] = elements.map((e, i) => {
            const kw = itemKw(e);
            // The first keyword stays on the DROP line
            const elementName = e.name ?? '';
            return kw && i > 0 ? [keyword(kw, opts), elementName ? ' ' : '', elementName] : elementName;
        });
        const firstKw = elements[0] ? itemKw(elements[0]) : null;
        const dropKw = keyword(firstKw ? `DROP ${firstKw}` : 'DROP', opts);
        const nameList: Doc = group([indent([softline, join([',', line], itemDocs.filter((d) => d !== ''))])]);
        // WITH (ONLINE = ON, WAIT_AT_LOW_PRIORITY ...) on DROP CLUSTERED CONSTRAINT
        const allDropOptions = elements.flatMap((e) => e.dropOptions ?? []);
        const withPart: Doc =
            allDropOptions.length
                ? [' ', keyword('WITH', opts), ' ', optionItems(allDropOptions, opts)]
                : '';
        return alter([
            dropKw,
            itemDocs.every((d) => d === '') ? '' : [' ', nameList],
            withPart,
        ]);
    }

    if (alterType === 'AlterTableConstraintModificationStatement') {
        const enforcement = propStr(node, 'constraintEnforcement');
        const constraintNames = propStrArr(node, 'constraintNames');
        const enforcementKw = enforcement === 'Check' ? keyword('CHECK', opts) : keyword('NOCHECK', opts);
        const nameList: Doc =
            constraintNames.length > 0
                ? group([indent([softline, join([',', line], constraintNames)])])
                : keyword('ALL', opts);
        const modCheck = propStr(node, 'withCheckEnforcement');
        const modCheckPrefix: Doc =
            modCheck === 'Check'
                ? [keyword('WITH CHECK', opts), ' ']
                : modCheck === 'NoCheck'
                  ? [keyword('WITH NOCHECK', opts), ' ']
                  : '';
        return alter([
            modCheckPrefix,
            enforcementKw,
            ' ',
            keyword('CONSTRAINT', opts),
            ' ',
            nameList,
        ]);
    }

    if (alterType === 'AlterTableAlterColumnStatement') {
        const column = propStr(node, 'column') ?? '';
        const alterColumnOption = propStr(node, 'alterColumnOption');
        const maskingFunction = propStr(node, 'maskingFunction');

        // ADD/DROP modifier variants (no data type change, just add/remove a column property)
        if (alterColumnOption) {
            let optDoc: Doc;
            if (alterColumnOption === 'AddMaskingFunction') {
                // ALTER COLUMN col ADD MASKED WITH (FUNCTION = 'fn()')
                const fn = maskingFunction ?? 'default()';
                optDoc = [keyword('ADD MASKED WITH', opts), ' (', keyword('FUNCTION', opts), ` = '${fn}')`];
            } else {
                const optMap: Record<string, string> = {
                    DropMaskingFunction: 'DROP MASKED',
                    AddSparse: 'ADD SPARSE',
                    DropSparse: 'DROP SPARSE',
                    AddRowGuidCol: 'ADD ROWGUIDCOL',
                    DropRowGuidCol: 'DROP ROWGUIDCOL',
                    AddHidden: 'ADD HIDDEN',
                    DropHidden: 'DROP HIDDEN',
                    AddPersisted: 'ADD PERSISTED',
                    DropPersisted: 'DROP PERSISTED',
                    AddNotForReplication: 'ADD NOT FOR REPLICATION',
                    DropNotForReplication: 'DROP NOT FOR REPLICATION',
                };
                optDoc = keyword(
                    optMap[alterColumnOption] ?? alterColumnOption.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(),
                    opts,
                );
            }
            return alter([
                keyword('ALTER COLUMN', opts),
                ' ',
                column,
                ' ',
                optDoc,
            ]);
        }

        // Normal type-change: ALTER COLUMN col newtype [COLLATE ...] [NULL|NOT NULL]
        const dataType = propStr(node, 'dataType') ?? '';
        const collationAC = propStr(node, 'collation');
        const collatePart: Doc = collationAC
            ? [' ', keyword('COLLATE', opts), ' ', collationAC]
            : '';
        const nullPart = nullablePart(node.props?.['nullable'], opts);
        const encryption = node.props?.['encryption'] as
            | { columnEncryptionKey?: string; encryptionType?: string; algorithm?: string }
            | null
            | undefined;
        const encryptionPart: Doc = encryption ? [' ', encryptedWithDoc(encryption, opts)] : '';
        const generatedAlways = propStr(node, 'generatedAlways');
        const columnOptions = propStrArr(node, 'columnOptions');
        return alter([
            keyword('ALTER COLUMN', opts),
            ' ',
            column,
            ' ',
            propBool(node, 'isUdt') ? dataType : builtinTypeDoc(dataType, opts),
            collatePart,
            encryptionPart,
            node.props?.['isSparse'] ? [' ', keyword('SPARSE', opts)] : '',
            node.props?.['isFileStream'] ? [' ', keyword('FILESTREAM', opts)] : '',
            node.props?.['isColumnSet'] ? [' ', keyword('COLUMN_SET FOR ALL_SPARSE_COLUMNS', opts)] : '',
            generatedAlways
                ? [' ', keyword('GENERATED ALWAYS AS', opts), ' ', keyword(generatedAlwaysKeyword(generatedAlways), opts)]
                : '',
            node.props?.['isHidden'] ? [' ', keyword('HIDDEN', opts)] : '',
            node.props?.['isMasked']
                ? [
                      ' ',
                      keyword('MASKED WITH', opts),
                      ' (',
                      keyword('FUNCTION', opts),
                      ` = '${(maskingFunction ?? 'default()').replace(/'/g, "''")}')`,
                  ]
                : '',
            nullPart,
            columnOptions.length ? [' ', keyword('WITH', opts), ' ', optionItems(columnOptions, opts)] : '',
        ]);
    }

    if (alterType === 'AlterTableSetStatement') {
        // Options come pre-serialized from SerializeTableOption (e.g. "lock_escalation = table",
        // "system_versioning = on (history_table = dbo.Tbl)"). Render them verbatim — applying
        // keyword() casing would uppercase embedded schema/table names.
        const options = propStrArr(node, 'options');
        return alter([
            keyword('SET', opts),
            ' ',
            optionItems(options.map(nestedOptionDoc), opts),
        ]);
    }

    if (alterType === 'AlterTableRebuildStatement') {
        const partitionAll = node.props?.['partitionAll'] as boolean | undefined;
        const partitionNumber = propStr(node, 'partitionNumber');
        const indexOptions = propStrArr(node, 'indexOptions');
        // REBUILD alone rebuilds the whole table; PARTITION = n | ALL narrows it
        const partDoc: Doc = partitionAll ? keyword('ALL', opts) : (partitionNumber ?? '');
        const partitionPart: Doc = partitionAll || partitionNumber ? [' ', keyword('PARTITION =', opts), ' ', partDoc] : '';
        const withDoc: Doc = indexOptions.length
            ? [' ', keyword('WITH', opts), ' ', optionItems(indexOptions, opts)]
            : '';
        return alter([
            keyword('REBUILD', opts),
            partitionPart,
            withDoc,
        ]);
    }

    if (alterType === 'AlterTableSwitchStatement') {
        const sourcePartition = propStr(node, 'sourcePartition');
        const targetTable = prop(node, 'targetTable');
        const targetPartition = propStr(node, 'targetPartition');
        const switchOptions = propStrArr(node, 'switchOptions');
        const sourceDoc: Doc = sourcePartition ? [' ', keyword('PARTITION', opts), ' ', sourcePartition] : '';
        const targetDoc: Doc = targetTable ? schemaObjectName(targetTable) : '';
        const targetPartDoc: Doc = targetPartition ? [' ', keyword('PARTITION', opts), ' ', targetPartition] : '';
        const switchOptDoc: Doc =
            switchOptions.length
                ? [' ', keyword('WITH', opts), ' ', optionItems(switchOptions, opts)]
                : '';
        return alter([
            keyword('SWITCH', opts),
            sourceDoc,
            ' ',
            keyword('TO', opts),
            ' ',
            targetDoc,
            targetPartDoc,
            switchOptDoc,
        ]);
    }

    if (alterType === 'AlterTableTriggerModificationStatement') {
        const enable = propBool(node, 'enable');
        const triggerAll = node.props?.['triggerAll'] as boolean | null | undefined;
        const triggerNames = propStrArr(node, 'triggerNames');
        const verb: Doc = enable ? keyword('ENABLE TRIGGER', opts) : keyword('DISABLE TRIGGER', opts);
        const targets: Doc = triggerAll ? keyword('ALL', opts) : join(', ', triggerNames);
        return alter([verb, ' ', targets]);
    }

    if (alterType === 'AlterTableChangeTrackingModificationStatement') {
        const trackColumns = propStr(node, 'trackColumnsUpdated');
        return alter([
            keyword(propStr(node, 'changeTracking') === 'enable' ? 'ENABLE CHANGE_TRACKING' : 'DISABLE CHANGE_TRACKING', opts),
            trackColumns ? [' ', keyword('WITH', opts), ' (', keyword('TRACK_COLUMNS_UPDATED', opts), ' = ', keyword(trackColumns, opts), ')'] : '',
        ]);
    }

    return [keyword('ALTER TABLE', opts), ' ', name, ' /* ', alterType, ' */;'];
}

// ---------------------------------------------------------------------------
// CREATE INDEX
// ---------------------------------------------------------------------------

export function printCreateIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName') ?? 'idx';
    const isUnique = propBool(node, 'unique');
    const table = prop(node, 'table');
    const columns = propArr(node, 'columns');
    const includeColumns = propStrArr(node, 'includeColumns');
    const filterPredicateNode = prop(node, 'filterPredicate');

    const colDocs = columns.map((c) => {
        const colName = propStr(c, 'name') ?? c.text ?? '';
        return [colName, sortOrderDoc(propStr(c, 'sortOrder'), opts)] as Doc;
    });

    const uniqueKw: Doc = isUnique ? [keyword('UNIQUE', opts), ' '] : '';
    // Preserve CLUSTERED / NONCLUSTERED exactly as written; omit when not specified.
    const clusteredProp = node.props?.['clustered'];
    const clusteredKw: Doc =
        clusteredProp === true
            ? [keyword('CLUSTERED', opts), ' ']
            : clusteredProp === false
              ? [keyword('NONCLUSTERED', opts), ' ']
              : '';

    const onClause: Doc = [keyword('ON', opts), ' ', schemaObjectName(table), ' ', optionItems(colDocs, opts)];
    const headText = ['create ', isUnique ? 'unique ' : '', clusteredProp === true ? 'clustered ' : clusteredProp === false ? 'nonclustered ' : '',
        'index ', indexName, ' on ', schemaObjectName(table), ' ('].join('');

    const tail: Doc[] = [];
    if (includeColumns.length > 0) tail.push([keyword('INCLUDE', opts), ' ', parenItems(includeColumns, opts)]);
    if (filterPredicateNode) tail.push([keyword('WHERE', opts), ' ', printBool(filterPredicateNode, opts, true)]);
    const indexOptions = propStrArr(node, 'indexOptions');
    if (indexOptions.length > 0) tail.push([keyword('WITH', opts), ' ', optionItems(indexOptions, opts)]);
    const onFileGroup = propStr(node, 'onFileGroup');
    if (onFileGroup) tail.push([keyword('ON', opts), ' ', onFileGroup]);
    const fileStreamOn = propStr(node, 'fileStreamOn');
    if (fileStreamOn) tail.push([keyword('FILESTREAM_ON', opts), ' ', fileStreamOn]);

    const head: Doc = [keyword('CREATE', opts), ' ', uniqueKw, clusteredKw, keyword('INDEX', opts), ' ', indexName];
    return createIndexDoc(head, headText, onClause, tail, opts);
}

// ---------------------------------------------------------------------------
// CREATE VECTOR INDEX — SQL Server 2025
// ---------------------------------------------------------------------------

export function printCreateVectorIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName') ?? 'idx';
    const table = prop(node, 'table');
    const vectorCol = propStr(node, 'vectorColumn') ?? '';
    const indexOptions = propStrArr(node, 'indexOptions');
    const withPart: Doc =
        indexOptions.length > 0
            ? [hardline, keyword('WITH', opts), ' ', optionItems(indexOptions, opts)]
            : '';
    const onFileGroup = propStr(node, 'onFileGroup');
    const fileGroupPart: Doc = onFileGroup ? [hardline, keyword('ON', opts), ' ', onFileGroup] : '';
    return group([
        keyword('CREATE', opts),
        ' ',
        keyword('VECTOR', opts),
        ' ',
        keyword('INDEX', opts),
        ' ',
        indexName,
        indent([
            hardline,
            keyword('ON', opts),
            ' ',
            schemaObjectName(table),
            '(',
            vectorCol,
            ')',
        ]),
        withPart,
        fileGroupPart,
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// ALTER INDEX
// ---------------------------------------------------------------------------

export function printAlterIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName');
    const table = prop(node, 'table');
    const alterType = propStr(node, 'alterType') ?? 'Rebuild';
    if (alterType === 'UpdateSelectiveXmlPaths') return printAlterSelectiveXmlIndex(node, opts);
    const typeKwMap: Record<string, string> = {
        Rebuild: 'REBUILD',
        Reorganize: 'REORGANIZE',
        Disable: 'DISABLE',
        Set: 'SET',
    };
    const typeKw = keyword(typeKwMap[alterType] ?? alterType.toUpperCase(), opts);
    const indexOptions = propStrArr(node, 'indexOptions');
    const partition = propStr(node, 'partition');
    // ALTER INDEX ... SET (options) has no WITH; REBUILD / REORGANIZE / DISABLE take WITH (options)
    const withPart: Doc =
        indexOptions.length > 0
            ? [' ', alterType === 'Set' ? '' : [keyword('WITH', opts), ' '], optionItems(indexOptions, opts)]
            : '';
    const partitionPart: Doc = partition ? [' ', keyword('PARTITION', opts), ' = ', partition] : '';
    return [
        keyword('ALTER INDEX', opts),
        ' ',
        indexName ? indexName : keyword('ALL', opts),
        ' ',
        keyword('ON', opts),
        ' ',
        schemaObjectName(table),
        ' ',
        typeKw,
        partitionPart,
        withPart,
        ';',
    ];
}

/** ALTER INDEX ix ON t [WITH XMLNAMESPACES (...)] FOR (ADD p = '/a' AS SQL int, REMOVE q) */
function printAlterSelectiveXmlIndex(node: SqlNode, opts: Options): Doc {
    const namespaces = propStrArr(node, 'xmlNamespaces');
    const paths = propArr(node, 'paths').map((p): Doc => {
        const name = propStr(p, 'name') ?? '';
        const path = propStr(p, 'path');
        if (!path) return [keyword('REMOVE', opts), ' ', name];
        const sqlType = propStr(p, 'sqlType');
        const xqueryType = propStr(p, 'xqueryType');
        const maxLength = propStr(p, 'maxLength');
        return [
            keyword('ADD', opts), ' ', name, ' = ', path,
            sqlType ? [' ', keyword('AS SQL', opts), ' ', propBool(p, 'sqlTypeIsUdt') ? sqlType : builtinTypeDoc(sqlType, opts)] : '',
            xqueryType ? [' ', keyword('AS XQUERY', opts), ' ', xqueryType] : '',
            maxLength ? [' ', keyword('MAXLENGTH', opts), '(', maxLength, ')'] : '',
            propBool(p, 'singleton') ? [' ', keyword('SINGLETON', opts)] : '',
        ];
    });
    const head: Doc = [keyword('ALTER INDEX', opts), ' ', propStr(node, 'indexName') ?? '', ' ', keyword('ON', opts), ' ', schemaObjectName(prop(node, 'table'))];
    const forDoc: Doc = [keyword('FOR', opts), ' ', optionItems(paths, opts)];
    // With namespaces, each clause on a line of its own
    if (namespaces.length > 0) {
        return [head, hardline, keyword('WITH XMLNAMESPACES', opts), ' ', optionItems(namespaces, opts), hardline, forDoc, ';'];
    }
    return [head, ' ', forDoc, ';'];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// WITH options for procs and functions (RECOMPILE, ENCRYPTION, EXECUTE AS, ...)
// ---------------------------------------------------------------------------

function printExecuteAsClause(optNode: SqlNode, opts: Options): Doc {
    // ExecuteAsOption node: kind = Caller|Self|Owner|Login|User|String
    const kind = propStr(optNode, 'kind') ?? 'Caller';
    const principal = propStr(optNode, 'principal');
    // String kind = EXECUTE AS 'username' (no USER/LOGIN qualifier)
    if (kind === 'String') return [keyword('EXECUTE AS', opts), " '", (principal ?? '').replace(/'/g, "''"), "'"];
    const kindMap: Record<string, string> = {
        Caller: 'CALLER',
        Self: 'SELF',
        Owner: 'OWNER',
        Login: 'LOGIN',
        User: 'USER',
    };
    const kindKw = keyword(kindMap[kind] ?? kind.toUpperCase(), opts);
    if (principal) return [keyword('EXECUTE AS', opts), ' ', kindKw, " = '", principal.replace(/'/g, "''"), "'"];
    return [keyword('EXECUTE AS', opts), ' ', kindKw];
}

function printModuleOptions(node: SqlNode, opts: Options): Doc {
    const options = propArr(node, 'options');
    if (!options.length) return '';
    const optDocs = options.map((o) => {
        if (o.type === 'ExecuteAsOption') return printExecuteAsClause(o, opts);
        return keyword(o.text ?? '', opts);
    });
    return [hardline, group([keyword('WITH', opts), indent([line, join([',', line], optDocs)])])];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / CREATE OR ALTER PROCEDURE
// ---------------------------------------------------------------------------

/** A procedure or function parameter: @name type [VARYING] [= default] [OUTPUT] [READONLY]. */
function printParameter(p: SqlNode, opts: Options): Doc {
    const dt = propStr(p, 'dataType') ?? 'INT';
    const defaultVal = prop(p, 'defaultValue');
    return [
        propStr(p, 'name') ?? '@p', ' ',
        // UDT names are identifiers, not SQL keywords — skip keyword-casing
        propBool(p, 'isUdt') ? dt : builtinTypeDoc(dt, opts),
        propBool(p, 'varying') ? [' ', keyword('VARYING', opts)] : '',
        nullablePart(p.props?.['nullable'], opts),
        defaultVal ? [' = ', printNode(defaultVal, opts)] : '',
        propBool(p, 'output') ? [' ', keyword('OUTPUT', opts)] : '',
        propBool(p, 'readonly') ? [' ', keyword('READONLY', opts)] : '',
    ];
}

/**
 * BEGIN ATOMIC WITH (...) options — kind is a keyword (`TRANSACTION ISOLATION LEVEL`,
 * `LANGUAGE`, ...), keyword-cased per sqlKeywordCase; value is printed verbatim (an
 * identifier like SNAPSHOT, a literal, or ON/OFF). Shared by CREATE PROCEDURE's
 * natively-compiled body and the standalone BeginEndAtomicBlock statement printer.
 */
export function printAtomicOptions(options: SqlNode[], opts: Options): Doc[] {
    return options.map((o): Doc => [keyword(propStr(o, 'kind') ?? '', opts), ' = ', propStr(o, 'value') ?? '']);
}

/** `;number` after a procedure name: CREATE PROCEDURE name;2. */
function procedureNumber(node: SqlNode): Doc {
    const number = propStr(node, 'number');
    return number ? [';', number] : '';
}

export function printCreateProcedure(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const body = propArr(node, 'body');

    const paramDocs = parameters.map((p) => printParameter(p, opts));

    // Natively compiled procs have a single BEGIN ATOMIC WITH (...) body statement.
    const atomicBlock = body.length === 1 && body[0]?.type === 'BeginEndAtomicBlock' ? body[0] : null;
    const atomicOptions = atomicBlock ? propArr(atomicBlock, 'atomicOptions') : [];
    const innerBody = atomicBlock ? propArr(atomicBlock, 'statements') : unwrapBodyBlock(body);

    const preBody = commentsBlock(node.preBodyComments);
    const postParam = commentsBlock(node.postParamComments);

    const procKw =
        node.type === 'CreateOrAlterProcedureStatement'
            ? keyword('CREATE OR ALTER PROCEDURE', opts)
            : node.type === 'AlterProcedureStatement'
              ? keyword('ALTER PROCEDURE', opts)
              : keyword('CREATE PROCEDURE', opts);

    // CLR stored procedure: AS EXTERNAL NAME assembly.[class].method
    const externalName = propStr(node, 'externalName');
    if (externalName) {
        return group([
            procKw,
            ' ',
            schemaObjectName(prop(node, 'name')),
            procedureNumber(node),
            preBody,
            parameters.length > 0 ? indent([hardline, join([',', hardline], paramDocs)]) : '',
            postParam,
            printModuleOptions(node, opts),
            hardline,
            keyword('AS', opts),
            ' ',
            keyword('EXTERNAL NAME', opts),
            ' ',
            externalName,
            ';',
        ]);
    }

    return group([
        procKw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        procedureNumber(node),
        preBody,
        parameters.length > 0 ? indent([hardline, join([',', hardline], paramDocs)]) : '',
        postParam,
        printModuleOptions(node, opts),
        // FOR REPLICATION: a procedure only replication runs
        propBool(node, 'forReplication') ? [hardline, keyword('FOR REPLICATION', opts)] : '',
        hardline,
        keyword('AS', opts),
        hardline,
        ...(atomicOptions.length
            ? [
                  keyword('BEGIN', opts),
                  ' ',
                  keyword('ATOMIC', opts),
                  ' ',
                  keyword('WITH', opts),
                  ' (',
                  indent([hardline, join([',', hardline], printAtomicOptions(atomicOptions, opts))]),
                  hardline,
                  ')',
              ]
            : [keyword('BEGIN', opts)]),
        indent([hardline, joinBodyStatements(innerBody, opts)]),
        hardline,
        keyword('END', opts),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / CREATE OR ALTER FUNCTION
// ---------------------------------------------------------------------------

/** A scalar function's return type: a keyword, unless it names a user-defined type. */
function returnTypeDoc(node: SqlNode, returnType: string, opts: Options): Doc {
    return propBool(node, 'returnIsUdt') ? returnType : builtinTypeDoc(returnType, opts);
}

export function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const bodyType = propStr(node, 'bodyType') ?? 'scalar';
    const returnType = propStr(node, 'returnType') ?? '';
    const body = node.props?.['body'];

    const paramDocs = parameters.map((p) => printParameter(p, opts));

    const preBody = commentsBlock(node.preBodyComments);
    const postParam = commentsBlock(node.postParamComments);

    const fnKw =
        node.type === 'CreateOrAlterFunctionStatement'
            ? keyword('CREATE OR ALTER FUNCTION', opts)
            : node.type === 'AlterFunctionStatement'
              ? keyword('ALTER FUNCTION', opts)
              : keyword('CREATE FUNCTION', opts);

    const nameAndParamsNoOpts: Doc = [
        fnKw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        // comments end at a line break: the parameter list can't follow on their line
        node.preBodyComments?.length ? [preBody, hardline] : '',
        group(['(', parameters.length > 0 ? [indent([softline, join([',', line], paramDocs)]), softline] : '', ')']),
        postParam,
    ];

    // CLR function: EXTERNAL NAME assembly.[class].method (no body)
    const externalName = propStr(node, 'externalName');
    if (externalName) {
        const clrColumns = propArr(node, 'returnColumns');
        return [
            nameAndParamsNoOpts,
            hardline,
            keyword('RETURNS', opts),
            ' ',
            clrColumns.length > 0
                ? [
                      keyword('TABLE', opts),
                      ' (',
                      indent([hardline, join([',', hardline], clrColumns.map((c) => printColumnDef(c, opts)))]),
                      hardline,
                      ')',
                  ]
                : returnTypeDoc(node, returnType, opts),
            printModuleOptions(node, opts),
            hardline,
            keyword('AS', opts),
            ' ',
            keyword('EXTERNAL NAME', opts),
            ' ',
            externalName,
            ';',
        ];
    }

    if (bodyType === 'table') {
        // Inline TVF: RETURNS TABLE [WITH options] AS RETURN (query) — no BEGIN/END
        const queryDoc = body && !Array.isArray(body) ? qexpr(body as SqlNode, opts) : '/* query */';
        return [
            nameAndParamsNoOpts,
            hardline,
            keyword('RETURNS', opts),
            ' ',
            keyword('TABLE', opts),
            printModuleOptions(node, opts),
            hardline,
            keyword('AS', opts),
            hardline,
            keyword('RETURN', opts),
            ' (',
            indent([hardline, queryDoc]),
            hardline,
            ')',
            ';',
        ];
    }

    // Scalar or multi-statement TVF — both use BEGIN...END.
    // Natively compiled functions have a single BEGIN ATOMIC WITH (...) body statement,
    // same as natively compiled procedures — print its options instead of nesting
    // another BEGIN...END around it (printStatement's own BeginEndAtomicBlock case
    // already prints BEGIN ATOMIC ... END, so wrapping it again duplicates BEGIN/END).
    const bodyArr = Array.isArray(body) ? (body as SqlNode[]) : [];
    const atomicBlock = bodyArr.length === 1 && bodyArr[0]?.type === 'BeginEndAtomicBlock' ? bodyArr[0] : null;
    const atomicOptions = atomicBlock ? propArr(atomicBlock, 'atomicOptions') : [];
    const stmts = atomicBlock ? propArr(atomicBlock, 'statements') : unwrapBodyBlock(bodyArr);
    const bodyDoc: Doc = joinBodyStatements(stmts, opts);

    let retTypePart: Doc;
    if (bodyType === 'inline-table') {
        const returnVar = propStr(node, 'returnVar') ?? '@t';
        const returnColumns = propArr(node, 'returnColumns');
        const colDocs = [
            ...returnColumns.map((c) => printColumnDef(c as SqlNode, opts)),
            ...propArr(node, 'returnConstraints').map((c) => printConstraintDef(c, opts)),
            ...propArr(node, 'returnIndexes').map((i) => printInlineIndex(i, opts)),
        ];
        retTypePart = [
            returnVar,
            ' ',
            keyword('TABLE', opts),
            ' (',
            indent([hardline, join([',', hardline], colDocs)]),
            hardline,
            ')',
        ];
    } else {
        retTypePart = returnTypeDoc(node, returnType, opts);
    }

    // WITH options come AFTER RETURNS (per T-SQL syntax):
    // CREATE FUNCTION ... (params) RETURNS type WITH options AS BEGIN ... END
    return [
        nameAndParamsNoOpts,
        hardline,
        keyword('RETURNS', opts),
        ' ',
        retTypePart,
        printModuleOptions(node, opts),
        hardline,
        keyword('AS', opts),
        hardline,
        ...(atomicOptions.length
            ? [
                  keyword('BEGIN', opts),
                  ' ',
                  keyword('ATOMIC', opts),
                  ' ',
                  keyword('WITH', opts),
                  ' (',
                  indent([hardline, join([',', hardline], printAtomicOptions(atomicOptions, opts))]),
                  hardline,
                  ')',
              ]
            : [keyword('BEGIN', opts)]),
        indent([hardline, bodyDoc]),
        hardline,
        keyword('END', opts),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / CREATE OR ALTER VIEW
// ---------------------------------------------------------------------------

export function printCreateView(node: SqlNode, opts: Options): Doc {
    const columns = propStrArr(node, 'columns');
    const withOptions = propStrArr(node, 'withOptions');
    const body = prop(node, 'body');

    const kw =
        node.type === 'CreateOrAlterViewStatement'
            ? keyword('CREATE OR ALTER VIEW', opts)
            : node.type === 'AlterViewStatement'
              ? keyword('ALTER VIEW', opts)
              : keyword('CREATE VIEW', opts);

    const colsPart: Doc = columns.length ? [' ', parenList(columns)] : '';

    const withPart: Doc = withOptions.length
        ? [
              hardline,
              keyword('WITH', opts),
              ' ',
              join(
                  ', ',
                  withOptions.map((o) => keyword(o, opts)),
              ),
          ]
        : '';

    const preBodyPart = commentsBlock(node.preBodyComments);
    const withCheckOption = node.props?.['withCheckOption'];
    const checkOptionPart: Doc = withCheckOption ? [hardline, keyword('WITH CHECK OPTION', opts)] : '';

    return group([
        asQueryDoc(
            [kw, ' ', schemaObjectName(prop(node, 'name')), colsPart, withPart, preBodyPart],
            keyword('AS', opts),
            [...printCtes(node, opts), body ? qexpr(body, opts) : ''],
        ),
        checkOptionPart,
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER TRIGGER
// ---------------------------------------------------------------------------

export function printCreateTrigger(node: SqlNode, opts: Options): Doc {
    const kw = node.type === 'AlterTriggerStatement' ? keyword('ALTER TRIGGER', opts) : keyword('CREATE TRIGGER', opts);

    const triggerType = propStr(node, 'triggerType') ?? 'After';
    const typeMap: Record<string, string> = {
        For: 'FOR',
        After: 'AFTER',
        InsteadOf: 'INSTEAD OF',
    };
    const typeKw = keyword(typeMap[triggerType] ?? triggerType.toUpperCase(), opts);
    const actions = propStrArr(node, 'actions');
    const actionList: Doc = actions.length
        ? join(', ', actions.map((a) => keyword(a.toUpperCase(), opts)))
        : '';
    const notForReplication = propBool(node, 'notForReplication');
    const notForReplicationDoc: Doc = notForReplication ? [hardline, keyword('NOT FOR REPLICATION', opts)] : '';
    const triggerBody = unwrapBodyBlock(propArr(node, 'body'));
    const externalName = propStr(node, 'externalName');

    const triggerScope = propStr(node, 'triggerScope'); // 'Database' or 'AllServer' for DDL triggers
    const onTarget: Doc = triggerScope === 'Database'
        ? keyword('DATABASE', opts)
        : triggerScope === 'AllServer'
          ? keyword('ALL SERVER', opts)
          : schemaObjectName(prop(node, 'onName'));

    return [
        kw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        hardline,
        keyword('ON', opts),
        ' ',
        onTarget,
        printModuleOptions(node, opts),
        hardline,
        typeKw,
        ' ',
        actionList,
        notForReplicationDoc,
        hardline,
        keyword('AS', opts),
        // CLR trigger: AS EXTERNAL NAME assembly.[class].method
        ...(externalName
            ? [' ', keyword('EXTERNAL NAME', opts), ' ', externalName, ';']
            : [
                  hardline,
                  keyword('BEGIN', opts),
                  indent([hardline, joinBodyStatements(triggerBody, opts)]),
                  hardline,
                  keyword('END', opts),
                  ';',
              ]),
    ];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER SEQUENCE
// ---------------------------------------------------------------------------

function sequenceOptions(node: SqlNode, opts: Options): Doc[] {
    const parts: Doc[] = [];
    const startWith = propStr(node, 'startWith');
    if (startWith != null) parts.push([keyword('START WITH', opts), ' ', startWith]);
    const restartWith = propStr(node, 'restartWith');
    if (restartWith != null) parts.push([keyword('RESTART WITH', opts), ' ', restartWith]);
    else if (propBool(node, 'restart')) parts.push([keyword('RESTART', opts)]);
    const incrementBy = propStr(node, 'incrementBy');
    if (incrementBy != null) parts.push([keyword('INCREMENT BY', opts), ' ', incrementBy]);
    const minValue = propStr(node, 'minValue');
    const noMinValue = node.props?.['noMinValue'];
    if (minValue != null) parts.push([keyword('MINVALUE', opts), ' ', minValue]);
    else if (noMinValue) parts.push([keyword('NO MINVALUE', opts)]);
    const maxValue = propStr(node, 'maxValue');
    const noMaxValue = node.props?.['noMaxValue'];
    if (maxValue != null) parts.push([keyword('MAXVALUE', opts), ' ', maxValue]);
    else if (noMaxValue) parts.push([keyword('NO MAXVALUE', opts)]);
    const cycle = node.props?.['cycle'];
    if (cycle === true) parts.push([keyword('CYCLE', opts)]);
    else if (cycle === false) parts.push([keyword('NO CYCLE', opts)]);
    const cache = propStr(node, 'cache');
    const noCache = node.props?.['noCache'];
    if (cache != null) parts.push([keyword('CACHE', opts), ' ', cache]);
    else if (noCache) parts.push([keyword('NO CACHE', opts)]);
    else if (propBool(node, 'cacheDefault')) parts.push([keyword('CACHE', opts)]);
    return parts;
}

function sequenceHeader(kw: Doc, node: SqlNode, opts: Options): Doc {
    const dataType = propStr(node, 'dataType');
    const asPart: Doc = dataType ? [' ', keyword('AS', opts), ' ', keyword(dataType, opts)] : '';
    return [kw, ' ', schemaObjectName(prop(node, 'name')), asPart];
}

export function printCreateSequence(node: SqlNode, opts: Options): Doc {
    return optionLinesDoc(sequenceHeader(keyword('CREATE SEQUENCE', opts), node, opts), sequenceOptions(node, opts));
}

export function printAlterSequence(node: SqlNode, opts: Options): Doc {
    return optionLinesDoc(sequenceHeader(keyword('ALTER SEQUENCE', opts), node, opts), sequenceOptions(node, opts));
}

// ---------------------------------------------------------------------------
// BULK INSERT
// ---------------------------------------------------------------------------

export function printBulkInsert(node: SqlNode, opts: Options): Doc {
    const table = prop(node, 'table');
    const from = propStr(node, 'from');
    const options = propStrArr(node, 'options');
    const optDocs: Doc =
        options.length > 0
            ? [
                  hardline,
                  keyword('WITH', opts),
                  ' (',
                  indent([hardline, join([',', hardline], options)]),
                  hardline,
                  ')',
              ]
            : '';
    return group([
        keyword('BULK INSERT', opts),
        ' ',
        schemaObjectName(table),
        hardline,
        keyword('FROM', opts),
        ' ',
        from ?? '',
        optDocs,
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE TYPE
// ---------------------------------------------------------------------------

export function printCreateTypeUddt(node: SqlNode, opts: Options): Doc {
    return [
        keyword('CREATE TYPE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' ',
        keyword('FROM', opts),
        ' ',
        propBool(node, 'isUdt') ? (propStr(node, 'dataType') ?? '') : keyword(propStr(node, 'dataType') ?? '', opts),
        nullablePart(node.props?.['nullable'], opts),
        ';',
    ];
}

export function printCreateTypeTable(node: SqlNode, opts: Options): Doc {
    const allDefs = [
        ...propArr(node, 'columns').map((c) => withTrailingComment(c, printColumnDef(c, opts))),
        ...propArr(node, 'constraints').map((c) => withTrailingComment(c, printConstraintDef(c, opts))),
        ...propArr(node, 'indexes').map((i) => withTrailingComment(i, printInlineIndex(i, opts))),
    ];
    const options = propStrArr(node, 'options');
    return group([
        keyword('CREATE TYPE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' ',
        keyword('AS TABLE', opts),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ')',
        options.length > 0 ? [hardline, keyword('WITH', opts), ' ', parenList(options)] : '',
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// DROP helpers (shared across multiple statement types)
// ---------------------------------------------------------------------------

export function printDropObjects(objType: string, node: SqlNode, opts: Options): Doc {
    const names = propArr(node, 'names');
    const ifExists = propBool(node, 'ifExists');
    const triggerScope = propStr(node, 'triggerScope');
    // DROP TRIGGER t ON DATABASE | ON ALL SERVER
    const clauses: Doc[] = triggerScope ? [[keyword('ON', opts), ' ', keyword(triggerScope === 'AllServer' ? 'ALL SERVER' : 'DATABASE', opts)]] : [];
    return dropDoc([keyword('DROP', opts), ' ', keyword(objType, opts), ifExistsDoc(ifExists, opts)], names.map((n) => schemaObjectName(n)), clauses);
}

/** A DROP INDEX option; MOVE TO / FILESTREAM_ON name a filegroup, which keeps its case. */
function dropIndexOption(option: string, opts: Options): Doc {
    const target = /^(MOVE TO|FILESTREAM_ON) (.*)$/.exec(option);
    return target ? [keyword(target[1]!, opts), ' ', target[2]!] : keyword(option, opts);
}

export function printDropIndex(node: SqlNode, opts: Options): Doc {
    const ifExists = propBool(node, 'ifExists');
    const indices = propArr(node, 'indices');
    const indexDocs = indices.map((idx): Doc => {
        const qualifiedName = propStr(idx, 'qualifiedName');
        if (qualifiedName) return qualifiedName;
        if (!idx.props) return idx.text ?? '';
        const options = propStrArr(idx, 'options');
        return [
            propStr(idx, 'name') ?? '', ' ', keyword('ON', opts), ' ', schemaObjectName(prop(idx, 'table')),
            options.length > 0 ? [' ', keyword('WITH', opts), ' ', optionItems(options.map((o) => dropIndexOption(o, opts)), opts)] : '',
        ];
    });
    return dropDoc([keyword('DROP INDEX', opts), ifExistsDoc(ifExists, opts)], indexDocs, []);
}

// ---------------------------------------------------------------------------
// CREATE / DROP SYNONYM
// ---------------------------------------------------------------------------

export function printCreateSynonym(node: SqlNode, opts: Options): Doc {
    const name = schemaObjectName(prop(node, 'name'));
    const forName = schemaObjectName(prop(node, 'forName'));
    return [keyword('CREATE SYNONYM', opts), ' ', name, ' ', keyword('FOR', opts), ' ', forName, ';'];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / DROP SCHEMA
// ---------------------------------------------------------------------------

export function printCreateSchema(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const owner = propStr(node, 'owner');
    const ownerPart: Doc = owner ? [' ', keyword('AUTHORIZATION', opts), ' ', owner] : '';
    // Schema elements are part of the one CREATE SCHEMA statement: no semicolons between
    // them, or the first would end it and the rest would be separate statements
    const elements = propArr(node, 'elements').map((e) => withoutSemicolon(printStatement(e, opts)));
    return [
        keyword('CREATE SCHEMA', opts), ' ', name, ownerPart,
        elements.length > 0 ? indent(elements.map((e) => [hardline, e])) : '',
        ';',
    ];
}

/** A statement's doc without its final semicolon. */
function withoutSemicolon(doc: Doc): Doc {
    if (doc === ';') return '';
    if (Array.isArray(doc)) {
        const i = doc.length - 1;
        return i < 0 ? doc : [...doc.slice(0, i), withoutSemicolon(doc[i]!)];
    }
    if (doc && typeof doc === 'object' && 'contents' in doc && (doc as { type: string }).type === 'group') {
        return { ...doc, contents: withoutSemicolon((doc as { contents: Doc }).contents) } as Doc;
    }
    return doc;
}

export function printAlterSchema(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const objectKind = propStr(node, 'objectKind') ?? '';
    const objectName = schemaObjectName(prop(node, 'objectName'));

    // Emit the securable-type qualifier only when ScriptDom gives a non-default kind.
    // ScriptDom uses "Object" for a plain table/view/proc (no explicit qualifier needed).
    const kindMap: Record<string, string> = {
        Type: 'TYPE',
        XmlSchemaCollection: 'XML SCHEMA COLLECTION',
    };
    const qualifier = kindMap[objectKind];
    const transferTarget: Doc = qualifier ? [keyword(qualifier, opts), '::', objectName] : objectName;

    return [keyword('ALTER SCHEMA', opts), ' ', name, ' ', keyword('TRANSFER', opts), ' ', transferTarget, ';'];
}

export function printDropSchema(node: SqlNode, opts: Options): Doc {
    // DROP SCHEMA s CASCADE | RESTRICT
    const behavior = propStr(node, 'dropBehavior');
    const name = schemaObjectName(prop(node, 'name'));
    return printDropSingleObject('DROP SCHEMA', node, opts, behavior ? [name, ' ', keyword(behavior, opts)] : name);
}

// ---------------------------------------------------------------------------
// Always Encrypted — CREATE/DROP COLUMN MASTER KEY, CREATE/ALTER/DROP COLUMN ENCRYPTION KEY
// ---------------------------------------------------------------------------

export function printCreateColumnMasterKey(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const keyStoreProviderName = propStr(node, 'keyStoreProviderName');
    const keyPath = propStr(node, 'keyPath');
    const enclaveSignature = propStr(node, 'enclaveComputationsSignature');

    const withParts: Doc[] = [];
    if (keyStoreProviderName) withParts.push([keyword('KEY_STORE_PROVIDER_NAME', opts), ' = ', keyStoreProviderName]);
    if (keyPath) withParts.push([keyword('KEY_PATH', opts), ' = ', keyPath]);
    if (enclaveSignature)
        withParts.push([
            keyword('ENCLAVE_COMPUTATIONS', opts),
            ' (',
            keyword('SIGNATURE', opts),
            ' = ',
            enclaveSignature,
            ')',
        ]);

    return [
        keyword('CREATE COLUMN MASTER KEY', opts),
        ' ',
        name,
        ' ',
        keyword('WITH', opts),
        ' ',
        optionItems(withParts, opts),
        ';',
    ];
}

function printColumnEncryptionKeyValue(v: SqlNode, opts: Options): Doc {
    const columnMasterKey = propStr(v, 'columnMasterKey');
    const algorithm = propStr(v, 'algorithm');
    const encryptedValue = propStr(v, 'encryptedValue');
    const parts: Doc[] = [];
    if (columnMasterKey) parts.push([keyword('COLUMN_MASTER_KEY', opts), ' = ', columnMasterKey]);
    if (algorithm) parts.push([keyword('ALGORITHM', opts), ' = ', algorithm]);
    if (encryptedValue) parts.push([keyword('ENCRYPTED_VALUE', opts), ' = ', encryptedValue]);
    return optionItems(parts, opts);
}

export function printCreateColumnEncryptionKey(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const values = (propArr(node, 'values') ?? []) as SqlNode[];
    const valuesDoc = join(
        [',', hardline],
        values.map((v) => printColumnEncryptionKeyValue(v, opts))
    );
    return [
        keyword('CREATE COLUMN ENCRYPTION KEY', opts),
        ' ',
        name,
        ' ',
        keyword('WITH VALUES', opts),
        indent([hardline, valuesDoc]),
        ';',
    ];
}

export function printAlterColumnEncryptionKey(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const alterType = propStr(node, 'alterType') ?? 'ADD';
    const values = (propArr(node, 'values') ?? []) as SqlNode[];
    const value = values[0];
    return [
        keyword('ALTER COLUMN ENCRYPTION KEY', opts),
        ' ',
        name,
        ' ',
        keyword(`${alterType} VALUE`, opts),
        ' ',
        value ? printColumnEncryptionKeyValue(value, opts) : '()',
        ';',
    ];
}

export function printDropColumnMasterKey(node: SqlNode, opts: Options): Doc {
    return printDropSingleObject('DROP COLUMN MASTER KEY', node, opts, propStr(node, 'name') ?? '');
}

export function printDropColumnEncryptionKey(node: SqlNode, opts: Options): Doc {
    return printDropSingleObject('DROP COLUMN ENCRYPTION KEY', node, opts, propStr(node, 'name') ?? '');
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / DROP EXTERNAL MODEL (SQL Server 2025 AI functions)
// ---------------------------------------------------------------------------

function printExternalModelOptions(node: SqlNode, opts: Options): Doc {
    const location = propStr(node, 'location');
    const apiFormat = propStr(node, 'apiFormat');
    const modelType = propStr(node, 'modelType');
    const modelName = propStr(node, 'modelName');
    const credential = propStr(node, 'credential');
    const parameters = propStr(node, 'parameters');
    const localRuntimePath = propStr(node, 'localRuntimePath');

    const parts: Doc[] = [];
    if (location) parts.push([keyword('LOCATION', opts), ' = ', location]);
    if (apiFormat) parts.push([keyword('API_FORMAT', opts), ' = ', apiFormat]);
    if (modelType) parts.push([keyword('MODEL_TYPE', opts), ' = ', keyword(modelType, opts)]);
    if (modelName) parts.push([keyword('MODEL', opts), ' = ', modelName]);
    if (credential) parts.push([keyword('CREDENTIAL', opts), ' = ', credential]);
    if (parameters) parts.push([keyword('PARAMETERS', opts), ' = ', parameters]);
    if (localRuntimePath) parts.push([keyword('LOCAL_RUNTIME_PATH', opts), ' = ', localRuntimePath]);
    return parenList(parts);
}

export function printCreateExternalModel(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const owner = propStr(node, 'owner');
    const ownerPart: Doc = owner ? [' ', keyword('AUTHORIZATION', opts), ' ', owner] : '';
    return [
        keyword('CREATE EXTERNAL MODEL', opts),
        ' ',
        name,
        ownerPart,
        ' ',
        keyword('WITH', opts),
        ' ',
        printExternalModelOptions(node, opts),
        ';',
    ];
}

export function printAlterExternalModel(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    return [
        keyword('ALTER EXTERNAL MODEL', opts),
        ' ',
        name,
        ' ',
        keyword('SET', opts),
        ' ',
        printExternalModelOptions(node, opts),
        ';',
    ];
}

export function printDropExternalModel(node: SqlNode, opts: Options): Doc {
    return printDropSingleObject('DROP EXTERNAL MODEL', node, opts, propStr(node, 'name') ?? '');
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / DROP PARTITION FUNCTION
// ---------------------------------------------------------------------------

export function printCreatePartitionFunction(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const paramType = propStr(node, 'paramType') ?? '';
    const collation = propStr(node, 'collation');
    const range = propStr(node, 'range');
    const boundaryValues = propArr(node, 'boundaryValues');

    const rangeKw =
        range === 'Right'
            ? keyword('RANGE RIGHT', opts)
            : range === 'Left'
              ? keyword('RANGE LEFT', opts)
              : keyword('RANGE', opts);

    const collationPart: Doc = collation ? [' ', keyword('COLLATE', opts), ' ', collation] : '';
    const valsDocs = boundaryValues.map((v) => printNode(v as SqlNode, opts));
    const forValues: Doc = group([
        keyword('FOR VALUES', opts),
        ' (',
        indent([softline, join([',', line], valsDocs)]),
        softline,
        ')',
    ]);

    return [
        keyword('CREATE PARTITION FUNCTION', opts),
        ' ',
        name,
        ' (',
        keyword(paramType, opts),
        collationPart,
        ') ',
        keyword('AS', opts),
        ' ',
        rangeKw,
        indent([hardline, forValues]),
        ';',
    ];
}

export function printAlterPartitionFunction(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const isSplit = propBool(node, 'isSplit');
    const boundary = prop(node, 'boundary');
    const action = isSplit ? keyword('SPLIT RANGE', opts) : keyword('MERGE RANGE', opts);
    return [
        keyword('ALTER PARTITION FUNCTION', opts),
        ' ',
        name,
        '()',
        indent([hardline, action, ' (', boundary ? printNode(boundary as SqlNode, opts) : '', ')']),
        ';',
    ];
}

export function printDropPartitionFunction(node: SqlNode, opts: Options): Doc {
    return printDropSingleObject('DROP PARTITION FUNCTION', node, opts, propStr(node, 'name') ?? '');
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / DROP PARTITION SCHEME
// ---------------------------------------------------------------------------

export function printCreatePartitionScheme(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const pf = propStr(node, 'partitionFunction') ?? '';
    const isAll = propBool(node, 'isAll');
    const fileGroups = propArr(node, 'fileGroups');
    const fgDocs = fileGroups.map((fg) => String(fg));

    const fgListDoc = parenList(fgDocs);
    const toClause: Doc = isAll ? [keyword('ALL TO', opts), ' ', fgListDoc] : [keyword('TO', opts), ' ', fgListDoc];

    return [
        keyword('CREATE PARTITION SCHEME', opts),
        ' ',
        name,
        indent([hardline, keyword('AS PARTITION', opts), ' ', pf, hardline, toClause]),
        ';',
    ];
}

export function printAlterPartitionScheme(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const fileGroup = propStr(node, 'fileGroup');
    const nextUsed: Doc = fileGroup ? [keyword('NEXT USED', opts), ' ', fileGroup] : keyword('NEXT USED', opts);
    return [keyword('ALTER PARTITION SCHEME', opts), ' ', name, indent([hardline, nextUsed]), ';'];
}

export function printDropPartitionScheme(node: SqlNode, opts: Options): Doc {
    return printDropSingleObject('DROP PARTITION SCHEME', node, opts, propStr(node, 'name') ?? '');
}

// ---------------------------------------------------------------------------
// CREATE COLUMNSTORE INDEX
// ---------------------------------------------------------------------------

export function printCreateColumnStoreIndex(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const clustered = node.props?.['clustered'] as boolean | null | undefined;
    const onName = prop(node, 'onName');
    const columns = propStrArr(node, 'columns');
    const filterPredicateNode = prop(node, 'filterPredicate');
    const options = propStrArr(node, 'options');

    const clusterKw: Doc =
        clustered === true
            ? [keyword('CLUSTERED', opts), ' ']
            : clustered === false
              ? [keyword('NONCLUSTERED', opts), ' ']
              : '';
    const parts: Doc[] = [keyword('CREATE', opts), ' ', clusterKw, keyword('COLUMNSTORE INDEX', opts), ' ', name];
    parts.push([hardline, keyword('ON', opts), ' ', onName ? schemaObjectName(onName) : '']);
    if (columns.length) {
        parts.push([' ', parenList(columns)]);
    }
    const orderedColumns = propStrArr(node, 'orderedColumns');
    if (orderedColumns.length) parts.push([hardline, keyword('ORDER', opts), ' ', parenList(orderedColumns)]);
    if (filterPredicateNode) parts.push([hardline, printBoolClause('WHERE', filterPredicateNode, opts)]);
    if (options.length) {
        parts.push([
            hardline,
            group([
                keyword('WITH', opts),
                ' (',
                indent([
                    softline,
                    join(
                        [',', line],
                        options.map((o) => keyword(o, opts)),
                    ),
                ]),
                softline,
                ')',
            ]),
        ]);
    }
    const onFileGroup = propStr(node, 'onFileGroup');
    if (onFileGroup) parts.push([hardline, keyword('ON', opts), ' ', onFileGroup]);
    parts.push(';');
    return parts;
}

// ---------------------------------------------------------------------------
// ENABLE / DISABLE TRIGGER
// ---------------------------------------------------------------------------

export function printEnableDisableTrigger(node: SqlNode, opts: Options): Doc {
    const enforcement = propStr(node, 'enforcement') ?? 'Enable';
    const all = propBool(node, 'all');
    const triggerNames = propStrArr(node, 'triggerNames');
    const targetScope = propStr(node, 'targetScope') ?? 'Normal';
    const targetName = prop(node, 'targetName');

    const verb = enforcement === 'Disable' ? 'DISABLE TRIGGER' : 'ENABLE TRIGGER';
    const triggersDoc: Doc = all ? keyword('ALL', opts) : join(', ', triggerNames);

    let onTarget: Doc;
    if (targetScope === 'Database') onTarget = keyword('DATABASE', opts);
    else if (targetScope === 'AllServer') onTarget = keyword('ALL SERVER', opts);
    else onTarget = targetName ? schemaObjectName(targetName) : '';

    return [keyword(verb, opts), ' ', triggersDoc, hardline, keyword('ON', opts), ' ', onTarget, ';'];
}

// ---------------------------------------------------------------------------
// CREATE / UPDATE / DROP STATISTICS
// ---------------------------------------------------------------------------

export function printCreateStatistics(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const onName = prop(node, 'onName');
    const columns = propStrArr(node, 'columns');
    const filterPredicateNode = prop(node, 'filterPredicate');
    const options = propStrArr(node, 'options');

    const parts: Doc[] = [keyword('CREATE STATISTICS', opts), ' ', name];
    parts.push([hardline, keyword('ON', opts), ' ', onName ? schemaObjectName(onName) : '']);
    if (columns.length) {
        parts.push([' ', parenList(columns)]);
    }
    if (filterPredicateNode) parts.push([hardline, printBoolClause('WHERE', filterPredicateNode, opts)]);
    if (options.length) parts.push([hardline, withOptionsClause(options, opts)]);
    parts.push(';');
    return parts;
}

export function printUpdateStatistics(node: SqlNode, opts: Options): Doc {
    const table = prop(node, 'table');
    const subElements = propStrArr(node, 'subElements');
    const options = propStrArr(node, 'options');

    const parts: Doc[] = [keyword('UPDATE STATISTICS', opts), ' ', table ? schemaObjectName(table) : ''];
    // Single stat name: no parens needed. Multiple: wrap in parens.
    if (subElements.length === 1) parts.push([' ', subElements[0]!]);
    else if (subElements.length) parts.push([' ', parenList(subElements)]);
    if (options.length) parts.push([hardline, withOptionsClause(options, opts)]);
    parts.push(';');
    return parts;
}

export function printDropStatistics(node: SqlNode, opts: Options): Doc {
    const objects = propStrArr(node, 'objects');
    return [keyword('DROP STATISTICS', opts), ' ', join([',', hardline], objects), ';'];
}
