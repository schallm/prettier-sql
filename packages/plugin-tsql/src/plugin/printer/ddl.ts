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
} from '@prettier-sql/core/printer/utils';
import { prop, propArr, propStr, propBool, schemaObjectName } from './helpers.js';
// printNode / printBool / qexpr / printStatementWithComments are imported from statements.ts
// — circular but safe in ESM (all imports are function references, never accessed during init)
import { printStatementWithComments, printNode, printBool, qexpr } from './statements.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
                options.map((o) => keyword(o, opts)),
            ),
        ]),
    ]);
}

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

/** Inline INDEX definition within CREATE TABLE body. */
function printInlineIndex(node: SqlNode, opts: Options): Doc {
    const indexName = propStr(node, 'indexName') ?? '';
    const isUnique = node.props?.['unique'];
    const kind = propStr(node, 'kind'); // 'clustered', 'nonclustered', etc.
    const columns = propArr(node, 'columns');
    const includeColumns = node.props?.['includeColumns'] as string[] | undefined;
    const filterPredicate = propStr(node, 'filterPredicate');
    const indexOptions = node.props?.['indexOptions'] as string[] | undefined;

    const uniqueKw: Doc = isUnique ? [keyword('UNIQUE', opts), ' '] : '';
    const kindKw: Doc = kind ? [keyword(kind.toUpperCase(), opts), ' '] : '';

    const colDocs = columns.map((c) => {
        const colName = propStr(c, 'name') ?? '';
        const sort = propStr(c, 'sortOrder') ?? 'Ascending';
        return sort === 'Descending' ? [colName, ' ', keyword('DESC', opts)] : [colName, ' ', keyword('ASC', opts)];
    });

    const includePart: Doc = includeColumns?.length
        ? [' ', keyword('INCLUDE', opts), ' ', parenList(includeColumns)]
        : '';
    const filterPart: Doc = filterPredicate ? [' ', keyword('WHERE', opts), ' ', filterPredicate] : '';
    const withPart: Doc = indexOptions?.length ? [' ', keyword('WITH', opts), ' (', join(', ', indexOptions), ')'] : '';

    return [
        keyword('INDEX', opts),
        ' ',
        indexName,
        ' ',
        uniqueKw,
        kindKw,
        parenList(colDocs as Doc[]),
        includePart,
        filterPart,
        withPart,
    ];
}

export function printCreateTable(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const options = node.props?.['options'] as string[] | undefined;
    const systemTimePeriod = node.props?.['systemTimePeriod'] as
        | { startColumn: string; endColumn: string }
        | null
        | undefined;

    const indexes = propArr(node, 'indexes');
    const allDefs: Doc[] = [
        ...columns.map((col) => printColumnDef(col, opts)),
        ...constraints.map((c) => printConstraintDef(c, opts)),
        ...indexes.map((idx) => printInlineIndex(idx, opts)),
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
        options && options.length > 0 ? [hardline, keyword('WITH', opts), ' ', parenList(options)] : '';
    const onFileGroup = propStr(node, 'onFileGroup');
    const textimageOn = propStr(node, 'textimageOn');
    const fileStreamOn = propStr(node, 'fileStreamOn');
    const onPart: Doc = onFileGroup ? [hardline, keyword('ON', opts), ' ', onFileGroup] : '';
    const textimagePart: Doc = textimageOn ? [hardline, keyword('TEXTIMAGE_ON', opts), ' ', textimageOn] : '';
    const fileStreamPart: Doc = fileStreamOn ? [hardline, keyword('FILESTREAM_ON', opts), ' ', fileStreamOn] : '';
    // Graph table types (AS NODE / AS EDGE)
    const asNode = node.props?.['asNode'] as boolean | undefined;
    const asEdge = node.props?.['asEdge'] as boolean | undefined;
    const graphPart: Doc = asNode
        ? [' ', keyword('AS NODE', opts)]
        : asEdge
          ? [' ', keyword('AS EDGE', opts)]
          : '';
    return group([
        keyword('CREATE TABLE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ')',
        graphPart,
        onPart,
        fileStreamPart,
        textimagePart,
        withPart,
        ';',
    ]);
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
        const baseType = keyword(dataType, opts);
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

    if (isIdentity) {
        const seed = identitySeed ?? '1';
        const inc = identityIncrement ?? '1';
        parts.push(' ', keyword('IDENTITY', opts), `(${seed}, ${inc})`);
        if (node.props?.['identityNotForReplication']) parts.push(' ', keyword('NOT FOR REPLICATION', opts));
    }
    if (node.props?.['isRowGuidCol']) parts.push(' ', keyword('ROWGUIDCOL', opts));
    // SPARSE / FILESTREAM / COLUMN_SET
    if (node.props?.['isSparse']) parts.push(' ', keyword('SPARSE', opts));
    if (node.props?.['isFileStream']) parts.push(' ', keyword('FILESTREAM', opts));
    if (node.props?.['isColumnSet']) parts.push(' ', keyword('COLUMN_SET FOR ALL_SPARSE_COLUMNS', opts));

    // Temporal table: GENERATED ALWAYS AS ROW START / ROW END [HIDDEN]
    const generatedAlways = propStr(node, 'generatedAlways');
    if (generatedAlways) {
        const gaMap: Record<string, string> = {
            RowStart: 'ROW START',
            RowEnd: 'ROW END',
            UserIdStart: 'USER ID START',
            UserIdEnd: 'USER ID END',
            UserNameStart: 'USER NAME START',
            UserNameEnd: 'USER NAME END',
            TransactionIdStart: 'TRANSACTION ID START',
            TransactionIdEnd: 'TRANSACTION ID END',
            SequenceNumberStart: 'SEQUENCE NUMBER START',
            SequenceNumberEnd: 'SEQUENCE NUMBER END',
        };
        const gaKw = gaMap[generatedAlways] ?? generatedAlways.toUpperCase();
        parts.push(' ', keyword('GENERATED ALWAYS AS', opts), ' ', keyword(gaKw, opts));
    }
    if (node.props?.['isHidden']) parts.push(' ', keyword('HIDDEN', opts));

    // Dynamic data masking
    if (node.props?.['isMasked']) {
        const maskFn = propStr(node, 'maskingFunction') ?? 'default()';
        parts.push(' ', keyword('MASKED WITH', opts), ' (', keyword('FUNCTION', opts), ` = '${maskFn}')`);
    }

    if (defaultValue) {
        const defaultName = propStr(node, 'defaultConstraintName');
        const defaultNamePrefix: Doc = defaultName ? [keyword('CONSTRAINT', opts), ' ', defaultName, ' '] : '';
        parts.push(' ', defaultNamePrefix, keyword('DEFAULT', opts), ' ', printNode(defaultValue, opts));
    }
    parts.push(nullablePart(isNullable, opts));
    if (checkConstraint) {
        const checkName = propStr(node, 'checkConstraintName');
        const checkPrefix: Doc = checkName ? [keyword('CONSTRAINT', opts), ' ', checkName, ' '] : '';
        parts.push(' ', checkPrefix, keyword('CHECK', opts), ' (', printBool(checkConstraint, opts), ')');
    }

    // Inline PRIMARY KEY / UNIQUE constraint (e.g. in table variable declarations)
    const uniqueConstraint = node.props?.['uniqueConstraint'] as
        | { constraintName?: string; isPrimaryKey: boolean; clustered: boolean | null }
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
        parts.push(' ', constraintNamePrefix, uqKw, clusteredKw);
    }

    // Inline REFERENCES (column-level foreign key: col type [CONSTRAINT name] REFERENCES Table(col))
    const foreignKey = node.props?.['foreignKey'] as
        | { constraintName?: string; refTable: SqlNode | null; refColumns?: string[]; deleteAction?: string; updateAction?: string }
        | null
        | undefined;
    if (foreignKey) {
        if (foreignKey.constraintName) {
            parts.push(' ', keyword('CONSTRAINT', opts), ' ', foreignKey.constraintName);
        }
        const refColsPart: Doc = foreignKey.refColumns?.length ? [' (', join(', ', foreignKey.refColumns), ')'] : '';
        parts.push(' ', keyword('REFERENCES', opts), ' ', schemaObjectName(foreignKey.refTable), refColsPart);
        if (foreignKey.deleteAction) {
            parts.push(
                ' ',
                keyword('ON DELETE', opts),
                ' ',
                keyword(
                    foreignKey.deleteAction
                        .replace(/([A-Z])/g, ' $1')
                        .trim()
                        .toUpperCase(),
                    opts,
                ),
            );
        }
        if (foreignKey.updateAction) {
            parts.push(
                ' ',
                keyword('ON UPDATE', opts),
                ' ',
                keyword(
                    foreignKey.updateAction
                        .replace(/([A-Z])/g, ' $1')
                        .trim()
                        .toUpperCase(),
                    opts,
                ),
            );
        }
    }

    return parts;
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
            // Columns are now {name, order} objects; fall back to plain strings for compat
            const rawCols = Array.isArray(node.props?.['columns']) ? node.props!['columns'] : [];
            const colDocs: Doc[] = (rawCols as Array<{ name: string; order: string } | string>).map((c) => {
                if (typeof c === 'string') return c;
                const dir: Doc = c.order === 'Descending' ? [' ', keyword('DESC', opts)] : '';
                return [c.name, dir] as Doc;
            });
            const colsDoc = parenList(colDocs);
            const indexOptions = node.props?.['indexOptions'] as string[] | undefined;
            const withPart: Doc = indexOptions?.length
                ? [' ', keyword('WITH', opts), ' (', join(', ', indexOptions), ')']
                : '';
            return group([namePrefix, indent([softline, kw, ' ', clusteredKw, colsDoc]), withPart]);
        }
        case 'CheckConstraint': {
            const expr = prop(node, 'expression');
            const nfr = propBool(node, 'notForReplication');
            return [
                namePrefix,
                keyword('CHECK', opts),
                nfr ? [' ', keyword('NOT FOR REPLICATION', opts)] : '',
                ' (',
                expr ? printBool(expr, opts) : '',
                ')',
            ];
        }
        case 'ForeignKeyConstraint': {
            const cols = Array.isArray(node.props?.['columns']) ? (node.props?.['columns'] as string[]) : [];
            const refCols = Array.isArray(node.props?.['refColumns']) ? (node.props?.['refColumns'] as string[]) : [];
            const refTable = prop(node, 'refTable');
            const refName = refTable ? schemaObjectName(refTable) : '';
            const deleteAction = propStr(node, 'deleteAction');
            const updateAction = propStr(node, 'updateAction');
            const nfr = propBool(node, 'notForReplication');
            const refActionKw = (action: string): Doc =>
                keyword(
                    action
                        .replace(/([A-Z])/g, ' $1')
                        .trim()
                        .toUpperCase(),
                    opts,
                );
            const fkColsDoc = parenList(cols);
            const refColsDoc = parenList(refCols);
            return [
                group([
                    namePrefix,
                    indent([
                        softline,
                        group([
                            keyword('FOREIGN KEY', opts),
                            ' ',
                            fkColsDoc,
                            indent([line, keyword('REFERENCES', opts), ' ', refName, ' ', refColsDoc]),
                        ]),
                        deleteAction ? [line, keyword('ON DELETE', opts), ' ', refActionKw(deleteAction)] : '',
                        updateAction ? [line, keyword('ON UPDATE', opts), ' ', refActionKw(updateAction)] : '',
                        nfr ? [line, keyword('NOT FOR REPLICATION', opts)] : '',
                    ]),
                ]),
            ];
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

    if (alterType === 'AlterTableAddTableElementStatement') {
        const withCheck = propStr(node, 'withCheckEnforcement');
        const withCheckPrefix: Doc =
            withCheck === 'Check'
                ? [keyword('WITH CHECK', opts), hardline]
                : withCheck === 'NoCheck'
                  ? [keyword('WITH NOCHECK', opts), hardline]
                  : '';
        const defs = [
            ...propArr(node, 'columns').map((c) => printColumnDef(c, opts)),
            ...propArr(node, 'constraints').map((c) => printConstraintDef(c, opts)),
        ];
        const addPart: Doc = defs.length === 1 ? [' ', defs[0]!] : indent([hardline, join([',', hardline], defs)]);
        return [keyword('ALTER TABLE', opts), ' ', name, hardline, withCheckPrefix, keyword('ADD', opts), addPart, ';'];
    }

    if (alterType === 'AlterTableDropTableElementStatement') {
        const elements = (node.props?.['elements'] ?? []) as Array<{
            name: string;
            elementType: string;
            ifExists: boolean;
            dropOptions?: string[];
        }>;
        // All elements share the same IF EXISTS flag (SQL only allows one DROP per statement)
        const ifExists = elements[0]?.ifExists ?? false;
        const isConstraint = elements[0]?.elementType === 'Constraint';
        const dropKw = isConstraint ? keyword('DROP CONSTRAINT', opts) : keyword('DROP COLUMN', opts);
        const nameList: Doc = group([
            indent([
                softline,
                join(
                    [',', line],
                    elements.map((e) => e.name),
                ),
            ]),
        ]);
        // WITH (ONLINE = ON, WAIT_AT_LOW_PRIORITY ...) on DROP CLUSTERED CONSTRAINT
        const allDropOptions = elements.flatMap((e) => e.dropOptions ?? []);
        const withPart: Doc =
            allDropOptions.length
                ? [' ', keyword('WITH', opts), ' (', join(', ', allDropOptions), ')']
                : '';
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            dropKw,
            ifExists ? [' ', keyword('IF EXISTS', opts)] : '',
            ' ',
            nameList,
            withPart,
            ';',
        ];
    }

    if (alterType === 'AlterTableConstraintModificationStatement') {
        const enforcement = propStr(node, 'constraintEnforcement');
        const constraintNames = node.props?.['constraintNames'] as string[] | null | undefined;
        const enforcementKw = enforcement === 'Check' ? keyword('CHECK', opts) : keyword('NOCHECK', opts);
        const nameList: Doc =
            constraintNames && constraintNames.length > 0
                ? group([indent([softline, join([',', line], constraintNames)])])
                : keyword('ALL', opts);
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            enforcementKw,
            ' ',
            keyword('CONSTRAINT', opts),
            ' ',
            nameList,
            ';',
        ];
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
                };
                optDoc = keyword(optMap[alterColumnOption] ?? alterColumnOption.toUpperCase(), opts);
            }
            return [
                keyword('ALTER TABLE', opts),
                ' ',
                name,
                hardline,
                keyword('ALTER COLUMN', opts),
                ' ',
                column,
                ' ',
                optDoc,
                ';',
            ];
        }

        // Normal type-change: ALTER COLUMN col newtype [COLLATE ...] [NULL|NOT NULL]
        const dataType = propStr(node, 'dataType') ?? '';
        const collationAC = propStr(node, 'collation');
        const collatePart: Doc = collationAC
            ? [' ', keyword('COLLATE', opts), ' ', collationAC]
            : '';
        const nullPart = nullablePart(node.props?.['nullable'], opts);
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('ALTER COLUMN', opts),
            ' ',
            column,
            ' ',
            keyword(dataType, opts),
            collatePart,
            nullPart,
            ';',
        ];
    }

    if (alterType === 'AlterTableSetStatement') {
        // Options come pre-serialized from SerializeTableOption (e.g. "lock_escalation = table",
        // "system_versioning = on (history_table = dbo.Tbl)"). Render them verbatim — applying
        // keyword() casing would uppercase embedded schema/table names.
        const options = (node.props?.['options'] ?? []) as string[];
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('SET', opts),
            ' (',
            join(', ', options),
            ')',
            ';',
        ];
    }

    if (alterType === 'AlterTableRebuildStatement') {
        const partitionAll = node.props?.['partitionAll'] as boolean | undefined;
        const partitionNumber = propStr(node, 'partitionNumber');
        const indexOptions = node.props?.['indexOptions'] as string[] | undefined;
        const partDoc: Doc = partitionAll ? keyword('ALL', opts) : (partitionNumber ?? '');
        const withDoc: Doc = indexOptions?.length
            ? [' ', keyword('WITH', opts), ' (', join(', ', indexOptions), ')']
            : '';
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('REBUILD PARTITION =', opts),
            ' ',
            partDoc,
            withDoc,
            ';',
        ];
    }

    if (alterType === 'AlterTableSwitchStatement') {
        const sourcePartition = propStr(node, 'sourcePartition');
        const targetTable = prop(node, 'targetTable');
        const targetPartition = propStr(node, 'targetPartition');
        const switchOptions = node.props?.['switchOptions'] as string[] | undefined;
        const sourceDoc: Doc = sourcePartition ? [' ', keyword('PARTITION', opts), ' ', sourcePartition] : '';
        const targetDoc: Doc = targetTable ? schemaObjectName(targetTable) : '';
        const targetPartDoc: Doc = targetPartition ? [' ', keyword('PARTITION', opts), ' ', targetPartition] : '';
        const switchOptDoc: Doc =
            switchOptions?.length
                ? [' ', keyword('WITH', opts), ' (', join(', ', switchOptions), ')']
                : '';
        return [
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('SWITCH', opts),
            sourceDoc,
            ' ',
            keyword('TO', opts),
            ' ',
            targetDoc,
            targetPartDoc,
            switchOptDoc,
            ';',
        ];
    }

    if (alterType === 'AlterTableTriggerModificationStatement') {
        const enable = propBool(node, 'enable');
        const triggerAll = node.props?.['triggerAll'] as boolean | null | undefined;
        const triggerNames = node.props?.['triggerNames'] as string[] | undefined;
        const verb: Doc = enable ? keyword('ENABLE TRIGGER', opts) : keyword('DISABLE TRIGGER', opts);
        const targets: Doc = triggerAll ? keyword('ALL', opts) : join(', ', triggerNames ?? []);
        return [keyword('ALTER TABLE', opts), ' ', name, hardline, verb, ' ', targets, ';'];
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
    const includeColumns = node.props?.['includeColumns'];
    const filterPredicate = propStr(node, 'filterPredicate');

    const colDocs = columns.map((c) => {
        const colName = propStr(c, 'name') ?? c.text ?? '';
        const sort = propStr(c, 'sortOrder') ?? 'Ascending';
        return sort === 'Descending'
            ? ([colName, ' ', keyword('DESC', opts)] as Doc)
            : ([colName, ' ', keyword('ASC', opts)] as Doc);
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

    const onClause: Doc = [
        keyword('ON', opts),
        ' ',
        schemaObjectName(table),
        ' (',
        indent([softline, join([',', line], colDocs)]),
        softline,
        ')',
    ];

    const includePart: Doc =
        Array.isArray(includeColumns) && includeColumns.length > 0
            ? [hardline, keyword('INCLUDE', opts), ' ', parenList(includeColumns as string[])]
            : '';

    const filterPart: Doc = filterPredicate ? [hardline, keyword('WHERE', opts), ' ', filterPredicate] : '';

    const indexOptions = node.props?.['indexOptions'] as string[] | undefined;
    const withPart: Doc =
        indexOptions && indexOptions.length > 0
            ? [hardline, keyword('WITH', opts), ' (', join(', ', indexOptions), ')']
            : '';

    const onFileGroup = propStr(node, 'onFileGroup');
    const fileGroupPart: Doc = onFileGroup ? [hardline, keyword('ON', opts), ' ', onFileGroup] : '';

    return group([
        keyword('CREATE', opts),
        ' ',
        uniqueKw,
        clusteredKw,
        keyword('INDEX', opts),
        ' ',
        indexName,
        indent([hardline, onClause, includePart, filterPart]),
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
    const typeKwMap: Record<string, string> = {
        Rebuild: 'REBUILD',
        Reorganize: 'REORGANIZE',
        Disable: 'DISABLE',
        Set: 'SET',
    };
    const typeKw = keyword(typeKwMap[alterType] ?? alterType.toUpperCase(), opts);
    const indexOptions = node.props?.['indexOptions'] as string[] | undefined;
    const partition = propStr(node, 'partition');
    const withPart: Doc =
        indexOptions && indexOptions.length > 0
            ? [' ', keyword('WITH', opts), ' (', join(', ', indexOptions), ')']
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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// WITH options for procs and functions (RECOMPILE, ENCRYPTION, EXECUTE AS, ...)
// ---------------------------------------------------------------------------

function printExecuteAsClause(optNode: SqlNode, opts: Options): Doc {
    // ExecuteAsOption node: kind = Caller|Self|Owner|Login|User|String
    const kind = propStr(optNode, 'kind') ?? 'Caller';
    const principal = propStr(optNode, 'principal');
    // String kind = EXECUTE AS 'username' (no USER/LOGIN qualifier)
    if (kind === 'String') return [keyword('EXECUTE AS', opts), " '", principal ?? '', "'"];
    const kindMap: Record<string, string> = {
        Caller: 'CALLER',
        Self: 'SELF',
        Owner: 'OWNER',
        Login: 'LOGIN',
        User: 'USER',
    };
    const kindKw = keyword(kindMap[kind] ?? kind.toUpperCase(), opts);
    if (principal) return [keyword('EXECUTE AS', opts), ' ', kindKw, " = '", principal, "'"];
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

export function printCreateProcedure(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const body = propArr(node, 'body');

    const paramDocs = parameters.map((p) => {
        const pName = propStr(p, 'name') ?? '@p';
        const dt = propStr(p, 'dataType') ?? 'INT';
        const isUdt = propBool(p, 'isUdt');
        const isOutput = propBool(p, 'output');
        const isReadonly = propBool(p, 'readonly');
        const defaultVal = prop(p, 'defaultValue');
        // UDT names are identifiers, not SQL keywords — skip keyword-casing
        const dtDoc: Doc = isUdt ? dt : keyword(dt, opts);
        const parts: Doc[] = [pName, ' ', dtDoc];
        if (defaultVal) parts.push(' = ', printNode(defaultVal, opts));
        if (isOutput) parts.push(' ', keyword('OUTPUT', opts));
        if (isReadonly) parts.push(' ', keyword('READONLY', opts));
        return parts as Doc;
    });

    // Natively compiled procs have a single BEGIN ATOMIC WITH (...) body statement.
    const atomicBlock = body.length === 1 && body[0].type === 'BeginEndAtomicBlock' ? body[0] : null;
    const atomicOptions = atomicBlock?.props?.['atomicOptions'] as string[] | undefined;
    const innerBody = atomicBlock ? propArr(atomicBlock, 'statements') : body;
    const bodyDocs = innerBody.map((s) => printStatementWithComments(s, opts));

    const preBody = commentsBlock(node.preBodyComments);
    const postParam = commentsBlock(node.postParamComments);

    const procKw =
        node.type === 'CreateOrAlterProcedureStatement'
            ? keyword('CREATE OR ALTER PROCEDURE', opts)
            : node.type === 'AlterProcedureStatement'
              ? keyword('ALTER PROCEDURE', opts)
              : keyword('CREATE PROCEDURE', opts);

    return group([
        procKw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        preBody,
        parameters.length > 0 ? indent([hardline, join([',', hardline], paramDocs)]) : '',
        postParam,
        printModuleOptions(node, opts),
        hardline,
        keyword('AS', opts),
        hardline,
        ...(atomicOptions?.length
            ? [
                  keyword('BEGIN', opts),
                  ' ',
                  keyword('ATOMIC', opts),
                  ' ',
                  keyword('WITH', opts),
                  ' (',
                  indent([hardline, join([',', hardline], atomicOptions)]),
                  hardline,
                  ')',
              ]
            : [keyword('BEGIN', opts)]),
        indent([hardline, join([hardline, hardline], bodyDocs)]),
        hardline,
        keyword('END', opts),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / CREATE OR ALTER FUNCTION
// ---------------------------------------------------------------------------

export function printCreateFunction(node: SqlNode, opts: Options): Doc {
    const parameters = propArr(node, 'parameters');
    const bodyType = propStr(node, 'bodyType') ?? 'scalar';
    const returnType = propStr(node, 'returnType') ?? '';
    const body = node.props?.['body'];

    const paramDocs = parameters.map((p) => {
        const pName = propStr(p, 'name') ?? '@p';
        const dt = propStr(p, 'dataType') ?? 'INT';
        const isUdt = propBool(p, 'isUdt');
        // UDT names are identifiers — skip keyword-casing
        return [pName, ' ', isUdt ? dt : keyword(dt, opts)] as Doc;
    });

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
        preBody,
        group(['(', parameters.length > 0 ? [indent([softline, join([',', line], paramDocs)]), softline] : '', ')']),
        postParam,
    ];

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

    // Scalar or multi-statement TVF — both use BEGIN...END
    const stmts = Array.isArray(body) ? (body as SqlNode[]).map((s) => printStatementWithComments(s, opts)) : [];
    const bodyDoc: Doc = join([hardline, hardline], stmts);

    let retTypePart: Doc;
    if (bodyType === 'inline-table') {
        const returnVar = propStr(node, 'returnVar') ?? '@t';
        const returnColumns = propArr(node, 'returnColumns');
        const colDocs = returnColumns.map((c) => printColumnDef(c as SqlNode, opts));
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
        retTypePart = keyword(returnType, opts);
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
        keyword('BEGIN', opts),
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
    const columns = node.props?.['columns'] as string[] | undefined;
    const withOptions = node.props?.['withOptions'] as string[] | undefined;
    const body = prop(node, 'body');

    const kw =
        node.type === 'CreateOrAlterViewStatement'
            ? keyword('CREATE OR ALTER VIEW', opts)
            : node.type === 'AlterViewStatement'
              ? keyword('ALTER VIEW', opts)
              : keyword('CREATE VIEW', opts);

    const colsPart: Doc = columns?.length ? [' ', parenList(columns)] : '';

    const withPart: Doc = withOptions?.length
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
        kw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        colsPart,
        withPart,
        preBodyPart,
        hardline,
        keyword('AS', opts),
        hardline,
        body ? qexpr(body, opts) : '',
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
    const actions = node.props?.['actions'];
    const actionList: Doc = Array.isArray(actions)
        ? join(
              ', ',
              (actions as string[]).map((a) => keyword(a.toUpperCase(), opts)),
          )
        : '';
    const notForReplication = propBool(node, 'notForReplication');
    const notForReplicationDoc: Doc = notForReplication ? [hardline, keyword('NOT FOR REPLICATION', opts)] : '';
    const bodyDocs = propArr(node, 'body').map((s) => printStatementWithComments(s, opts));

    const triggerScope = propStr(node, 'triggerScope'); // 'Database' or 'Server' for DDL triggers
    const onTarget: Doc = triggerScope === 'Database'
        ? keyword('DATABASE', opts)
        : triggerScope === 'Server'
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
        hardline,
        typeKw,
        ' ',
        actionList,
        notForReplicationDoc,
        hardline,
        keyword('AS', opts),
        hardline,
        keyword('BEGIN', opts),
        indent([hardline, join([hardline, hardline], bodyDocs)]),
        hardline,
        keyword('END', opts),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// CREATE / ALTER SEQUENCE
// ---------------------------------------------------------------------------

function printSequenceOptions(node: SqlNode, opts: Options): Doc[] {
    const parts: Doc[] = [];
    const startWith = propStr(node, 'startWith');
    if (startWith != null) parts.push(hardline, keyword('START WITH', opts), ' ', startWith);
    const restartWith = propStr(node, 'restartWith');
    if (restartWith != null) parts.push(hardline, keyword('RESTART WITH', opts), ' ', restartWith);
    const incrementBy = propStr(node, 'incrementBy');
    if (incrementBy != null) parts.push(hardline, keyword('INCREMENT BY', opts), ' ', incrementBy);
    const minValue = propStr(node, 'minValue');
    const noMinValue = node.props?.['noMinValue'];
    if (minValue != null) parts.push(hardline, keyword('MINVALUE', opts), ' ', minValue);
    else if (noMinValue) parts.push(hardline, keyword('NO MINVALUE', opts));
    const maxValue = propStr(node, 'maxValue');
    const noMaxValue = node.props?.['noMaxValue'];
    if (maxValue != null) parts.push(hardline, keyword('MAXVALUE', opts), ' ', maxValue);
    else if (noMaxValue) parts.push(hardline, keyword('NO MAXVALUE', opts));
    const cycle = node.props?.['cycle'];
    if (cycle === true) parts.push(hardline, keyword('CYCLE', opts));
    else if (cycle === false) parts.push(hardline, keyword('NO CYCLE', opts));
    const cache = propStr(node, 'cache');
    const noCache = node.props?.['noCache'];
    if (cache != null) parts.push(hardline, keyword('CACHE', opts), ' ', cache);
    else if (noCache) parts.push(hardline, keyword('NO CACHE', opts));
    return parts;
}

function sequenceHeader(kw: Doc, node: SqlNode, opts: Options): Doc {
    const dataType = propStr(node, 'dataType');
    const asPart: Doc = dataType ? [' ', keyword('AS', opts), ' ', keyword(dataType, opts)] : '';
    return [kw, ' ', schemaObjectName(prop(node, 'name')), asPart];
}

export function printCreateSequence(node: SqlNode, opts: Options): Doc {
    return group([
        sequenceHeader(keyword('CREATE SEQUENCE', opts), node, opts),
        indent(printSequenceOptions(node, opts)),
        ';',
    ]);
}

export function printAlterSequence(node: SqlNode, opts: Options): Doc {
    return group([
        sequenceHeader(keyword('ALTER SEQUENCE', opts), node, opts),
        indent(printSequenceOptions(node, opts)),
        ';',
    ]);
}

// ---------------------------------------------------------------------------
// BULK INSERT
// ---------------------------------------------------------------------------

export function printBulkInsert(node: SqlNode, opts: Options): Doc {
    const table = prop(node, 'table');
    const from = propStr(node, 'from');
    const options = node.props?.['options'];
    const optDocs: Doc =
        Array.isArray(options) && options.length > 0
            ? [
                  hardline,
                  keyword('WITH', opts),
                  ' (',
                  indent([hardline, join([',', hardline], options as string[])]),
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
        keyword(propStr(node, 'dataType') ?? '', opts),
        nullablePart(node.props?.['nullable'], opts),
        ';',
    ];
}

export function printCreateTypeTable(node: SqlNode, opts: Options): Doc {
    const allDefs = [
        ...propArr(node, 'columns').map((c) => printColumnDef(c, opts)),
        ...propArr(node, 'constraints').map((c) => printConstraintDef(c, opts)),
    ];
    return group([
        keyword('CREATE TYPE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' ',
        keyword('AS TABLE', opts),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ');',
    ]);
}

// ---------------------------------------------------------------------------
// DROP helpers (shared across multiple statement types)
// ---------------------------------------------------------------------------

export function printDropObjects(objType: string, node: SqlNode, opts: Options): Doc {
    const names = propArr(node, 'names');
    const ifExists = propBool(node, 'ifExists');
    return [
        keyword('DROP', opts),
        ' ',
        keyword(objType, opts),
        ifExistsDoc(ifExists, opts),
        ' ',
        join(
            ', ',
            names.map((n) => schemaObjectName(n)),
        ),
        ';',
    ];
}

export function printDropIndex(node: SqlNode, opts: Options): Doc {
    const ifExists = propBool(node, 'ifExists');
    const indices = propArr(node, 'indices');
    const indexDocs = indices.map(
        (idx) =>
            [propStr(idx, 'name') ?? '', ' ', keyword('ON', opts), ' ', schemaObjectName(prop(idx, 'table'))] as Doc,
    );
    const ifExistsPart: Doc = ifExists ? [' ', keyword('IF EXISTS', opts)] : '';
    if (indexDocs.length === 1) {
        return [keyword('DROP INDEX', opts), ifExistsPart, ' ', indexDocs[0]!, ';'];
    }
    return [keyword('DROP INDEX', opts), ifExistsPart, indent([hardline, join([',', hardline], indexDocs)]), ';'];
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
    return [keyword('CREATE SCHEMA', opts), ' ', name, ownerPart, ';'];
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
    const name = schemaObjectName(prop(node, 'name'));
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP SCHEMA', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
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
    const name = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP PARTITION FUNCTION', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
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
    const name = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP PARTITION SCHEME', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
}

// ---------------------------------------------------------------------------
// CREATE COLUMNSTORE INDEX
// ---------------------------------------------------------------------------

export function printCreateColumnStoreIndex(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const clustered = node.props?.['clustered'] as boolean | null | undefined;
    const onName = prop(node, 'onName');
    const columns = node.props?.['columns'] as string[] | undefined;
    const filterPredicate = propStr(node, 'filterPredicate');
    const options = node.props?.['options'] as string[] | undefined;

    const clusterKw: Doc =
        clustered === true
            ? [keyword('CLUSTERED', opts), ' ']
            : clustered === false
              ? [keyword('NONCLUSTERED', opts), ' ']
              : '';
    const parts: Doc[] = [keyword('CREATE', opts), ' ', clusterKw, keyword('COLUMNSTORE INDEX', opts), ' ', name];
    parts.push([hardline, keyword('ON', opts), ' ', onName ? schemaObjectName(onName) : '']);
    if (columns?.length) {
        parts.push([' ', parenList(columns)]);
    }
    if (filterPredicate) parts.push([hardline, keyword('WHERE', opts), ' ', filterPredicate]);
    if (options?.length) {
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
    parts.push(';');
    return parts;
}

// ---------------------------------------------------------------------------
// ENABLE / DISABLE TRIGGER
// ---------------------------------------------------------------------------

export function printEnableDisableTrigger(node: SqlNode, opts: Options): Doc {
    const enforcement = propStr(node, 'enforcement') ?? 'Enable';
    const all = propBool(node, 'all');
    const triggerNames = node.props?.['triggerNames'] as string[] | undefined;
    const targetScope = propStr(node, 'targetScope') ?? 'Normal';
    const targetName = prop(node, 'targetName');

    const verb = enforcement === 'Disable' ? 'DISABLE TRIGGER' : 'ENABLE TRIGGER';
    const triggersDoc: Doc = all
        ? keyword('ALL', opts)
        : join(
              ', ',
              (triggerNames ?? []).map((n) => n),
          );

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
    const columns = node.props?.['columns'] as string[] | undefined;
    const filterPredicate = propStr(node, 'filterPredicate');
    const options = node.props?.['options'] as string[] | undefined;

    const parts: Doc[] = [keyword('CREATE STATISTICS', opts), ' ', name];
    parts.push([hardline, keyword('ON', opts), ' ', onName ? schemaObjectName(onName) : '']);
    if (columns?.length) {
        parts.push([' ', parenList(columns)]);
    }
    if (filterPredicate) parts.push([hardline, keyword('WHERE', opts), ' ', filterPredicate]);
    if (options?.length) parts.push([hardline, withOptionsClause(options, opts)]);
    parts.push(';');
    return parts;
}

export function printUpdateStatistics(node: SqlNode, opts: Options): Doc {
    const table = prop(node, 'table');
    const subElements = node.props?.['subElements'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;

    const parts: Doc[] = [keyword('UPDATE STATISTICS', opts), ' ', table ? schemaObjectName(table) : ''];
    // Single stat name: no parens needed. Multiple: wrap in parens.
    if (subElements?.length === 1) parts.push([' ', subElements[0]]);
    else if (subElements?.length) parts.push([' ', parenList(subElements)]);
    if (options?.length) parts.push([hardline, withOptionsClause(options, opts)]);
    parts.push(';');
    return parts;
}

export function printDropStatistics(node: SqlNode, opts: Options): Doc {
    const objects = node.props?.['objects'] as string[] | undefined;
    return [
        keyword('DROP STATISTICS', opts),
        ' ',
        join(
            [',', hardline],
            (objects ?? []).map((o) => o),
        ),
        ';',
    ];
}
