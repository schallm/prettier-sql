import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, hardline, join, indent, group, softline, line, ifExistsDoc } from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName } from './helpers.js';
// printNode / printBool / qexpr / printStatementWithComments are imported from statements.ts
// — circular but safe in ESM (all imports are function references, never accessed during init)
import { printStatementWithComments, printNode, printBool, qexpr } from './statements.js';

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

export function printCreateTable(node: SqlNode, opts: Options): Doc {
    const columns = propArr(node, 'columns');
    const constraints = propArr(node, 'constraints');
    const allDefs = [
        ...columns.map((col) => printColumnDef(col, opts)),
        ...constraints.map((c) => printConstraintDef(c, opts)),
    ];
    return group([
        keyword('CREATE TABLE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' (',
        indent([hardline, join([',', hardline], allDefs)]),
        hardline,
        ');',
    ]);
}

export function printColumnDef(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? 'col';
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const params = node.props?.['dataTypeParams'];
    // Read nullable as a tristate (true/false/undefined) — propBool only returns true/false.
    const isNullable = node.props?.['nullable'];
    const isIdentity = propBool(node, 'identity');
    const identitySeed = propStr(node, 'identitySeed');
    const identityIncrement = propStr(node, 'identityIncrement');
    const defaultValue = prop(node, 'defaultValue');

    const typeStr: Doc =
        Array.isArray(params) && params.length > 0
            ? [keyword(dataType, opts), `(${(params as string[]).join(', ')})`]
            : keyword(dataType, opts);

    const parts: Doc[] = [name, ' ', typeStr];

    if (isIdentity) {
        const seed = identitySeed ?? '1';
        const inc = identityIncrement ?? '1';
        parts.push(' ', keyword('IDENTITY', opts), `(${seed}, ${inc})`);
    }
    if (defaultValue) parts.push(' ', keyword('DEFAULT', opts), ' ', printNode(defaultValue, opts));
    if (isNullable === false) parts.push(' ', keyword('NOT NULL', opts));
    else if (isNullable === true) parts.push(' ', keyword('NULL', opts));

    return parts;
}

export function printConstraintDef(node: SqlNode, opts: Options): Doc {
    const constraintName = propStr(node, 'constraintName');
    const namePrefix: Doc = constraintName ? [keyword('CONSTRAINT', opts), ' ', constraintName, ' '] : '';

    switch (node.type) {
        case 'UniqueConstraint': {
            const isPK = propBool(node, 'isPrimaryKey');
            const cols = node.props?.['columns'];
            const colList = Array.isArray(cols) ? (cols as string[]).join(', ') : '';
            const kw = isPK ? keyword('PRIMARY KEY', opts) : keyword('UNIQUE', opts);
            return [namePrefix, kw, ' (', colList, ')'];
        }
        case 'CheckConstraint': {
            const expr = prop(node, 'expression');
            return [namePrefix, keyword('CHECK', opts), ' (', expr ? printBool(expr, opts) : '', ')'];
        }
        case 'ForeignKeyConstraint': {
            const cols = node.props?.['columns'];
            const refTable = prop(node, 'refTable');
            const refCols = node.props?.['refColumns'];
            const colList = Array.isArray(cols) ? (cols as string[]).join(', ') : '';
            const refColList = Array.isArray(refCols) ? (refCols as string[]).join(', ') : '';
            const refName = refTable ? schemaObjectName(refTable) : '';
            return [
                namePrefix,
                keyword('FOREIGN KEY', opts),
                ' (',
                colList,
                ') ',
                keyword('REFERENCES', opts),
                ' ',
                refName,
                ' (',
                refColList,
                ')',
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
        const defs = [
            ...propArr(node, 'columns').map((c) => printColumnDef(c, opts)),
            ...propArr(node, 'constraints').map((c) => printConstraintDef(c, opts)),
        ];
        return group([
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('ADD', opts),
            indent([hardline, join([',', hardline], defs)]),
            ';',
        ]);
    }

    if (alterType === 'AlterTableDropTableElementStatement') {
        const elements = node.props?.['elements'];
        const elemList = Array.isArray(elements) ? (elements as string[]).join(', ') : '';
        return group([
            keyword('ALTER TABLE', opts),
            ' ',
            name,
            hardline,
            keyword('DROP COLUMN', opts),
            ' ',
            elemList,
            ';',
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
    const isClustered = propBool(node, 'clustered');
    const table = prop(node, 'table');
    const columns = propArr(node, 'columns');
    const includeColumns = node.props?.['includeColumns'];

    const colDocs = columns.map((c) => {
        const colName = propStr(c, 'name') ?? c.text ?? '';
        const sort = propStr(c, 'sortOrder') ?? 'Ascending';
        return sort === 'Descending'
            ? ([colName, ' ', keyword('DESC', opts)] as Doc)
            : ([colName, ' ', keyword('ASC', opts)] as Doc);
    });

    const uniqueKw = isUnique ? keyword('UNIQUE ', opts) : '';
    const clusteredKw = isClustered ? keyword('CLUSTERED ', opts) : keyword('NONCLUSTERED ', opts);

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
            ? [hardline, keyword('INCLUDE', opts), ' (', (includeColumns as string[]).join(', '), ')']
            : '';

    return group([
        keyword('CREATE ', opts),
        uniqueKw,
        clusteredKw,
        keyword('INDEX', opts),
        ' ',
        indexName,
        indent([hardline, onClause, includePart]),
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
    return [hardline, keyword('WITH', opts), ' ', join(', ', optDocs)];
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
        const isOutput = propBool(p, 'output');
        const isReadonly = propBool(p, 'readonly');
        const defaultVal = prop(p, 'defaultValue');
        const parts: Doc[] = [pName, ' ', keyword(dt, opts)];
        if (defaultVal) parts.push(' = ', printNode(defaultVal, opts));
        if (isOutput) parts.push(' ', keyword('OUTPUT', opts));
        if (isReadonly) parts.push(' ', keyword('READONLY', opts));
        return parts as Doc;
    });

    const bodyDocs = body.map((s) => printStatementWithComments(s, opts));

    const preBody: Doc = node.preBodyComments?.length
        ? (node.preBodyComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';
    const postParam: Doc = node.postParamComments?.length
        ? (node.postParamComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';

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
        keyword('BEGIN', opts),
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
        return [pName, ' ', keyword(dt, opts)] as Doc;
    });

    let bodyDoc: Doc;
    if (bodyType === 'table' || bodyType === 'inline-table') {
        bodyDoc = body && typeof body === 'object' ? qexpr(body as SqlNode, opts) : '/* table body */';
    } else {
        const stmts = Array.isArray(body) ? (body as SqlNode[]).map((s) => printStatementWithComments(s, opts)) : [];
        bodyDoc = join([hardline, hardline], stmts);
    }

    const preBody: Doc = node.preBodyComments?.length
        ? (node.preBodyComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';
    const postParam: Doc = node.postParamComments?.length
        ? (node.postParamComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';

    const fnKw =
        node.type === 'CreateOrAlterFunctionStatement'
            ? keyword('CREATE OR ALTER FUNCTION', opts)
            : node.type === 'AlterFunctionStatement'
              ? keyword('ALTER FUNCTION', opts)
              : keyword('CREATE FUNCTION', opts);

    return group([
        fnKw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        preBody,
        '(',
        parameters.length > 0 ? [indent([softline, join([',', line], paramDocs)]), softline] : '',
        ')',
        postParam,
        printModuleOptions(node, opts),
        hardline,
        keyword('RETURNS', opts),
        ' ',
        keyword(returnType, opts),
        hardline,
        keyword('AS', opts),
        hardline,
        keyword('BEGIN', opts),
        indent([hardline, bodyDoc]),
        hardline,
        keyword('END', opts),
        ';',
    ]);
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

    const colsPart: Doc = columns?.length ? [' (', join(', ', columns), ')'] : '';

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

    const preBodyPart: Doc = node.preBodyComments?.length
        ? (node.preBodyComments as string[]).flatMap((c): Doc[] => [hardline, c])
        : '';

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
    const bodyDocs = propArr(node, 'body').map((s) => printStatementWithComments(s, opts));

    return [
        kw,
        ' ',
        schemaObjectName(prop(node, 'name')),
        hardline,
        keyword('ON', opts),
        ' ',
        schemaObjectName(prop(node, 'onName')),
        hardline,
        typeKw,
        ' ',
        actionList,
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
    const dataType = propStr(node, 'dataType');
    if (dataType) parts.push(hardline, keyword('AS', opts), ' ', keyword(dataType, opts));
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

export function printCreateSequence(node: SqlNode, opts: Options): Doc {
    return group([
        keyword('CREATE SEQUENCE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        indent(printSequenceOptions(node, opts)),
        ';',
    ]);
}

export function printAlterSequence(node: SqlNode, opts: Options): Doc {
    return group([
        keyword('ALTER SEQUENCE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
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
    const nullable = node.props?.['nullable'];
    const nullablePart: Doc =
        nullable === false ? [' ', keyword('NOT NULL', opts)] : nullable === true ? [' ', keyword('NULL', opts)] : '';
    return [
        keyword('CREATE TYPE', opts),
        ' ',
        schemaObjectName(prop(node, 'name')),
        ' ',
        keyword('FROM', opts),
        ' ',
        keyword(propStr(node, 'dataType') ?? '', opts),
        nullablePart,
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
    const indices = propArr(node, 'indices');
    const indexDocs = indices.map(
        (idx) =>
            [propStr(idx, 'name') ?? '', ' ', keyword('ON', opts), ' ', schemaObjectName(prop(idx, 'table'))] as Doc,
    );
    return group([keyword('DROP INDEX', opts), ' ', join([',', hardline], indexDocs), ';']);
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
        ')',
        indent([hardline, keyword('AS', opts), ' ', rangeKw, hardline, forValues]),
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

    const toClause: Doc = isAll
        ? [keyword('ALL TO', opts), ' (', join(', ', fgDocs), ')']
        : [keyword('TO', opts), ' (', join(', ', fgDocs), ')'];

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
