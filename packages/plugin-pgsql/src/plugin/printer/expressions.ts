import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, join, indent, hardline, aliasDoc } from './utils.js';
import { printStatement, printQueryExpr } from './statements.js';
import { prop, propArr, propStr, propBool, rangeVarName } from './helpers.js';

type PrintFn = (node: SqlNode) => Doc;

export function printExpression(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    switch (node.type) {
        case 'SelectStatement': return printQueryExpr(node, opts);
        case 'SetOpStatement':  return printQueryExpr(node, opts);
        case 'ValuesStatement': return printStatement(node, opts);
        case 'Literal': return node.text ?? '';
        case 'ColumnRef': return propStr(node, 'name') ?? '';
        case 'BinaryExpr': return printBinaryExpr(node, opts, printNode);
        case 'BoolExpr': return printBoolExpr(node, opts, printNode);
        case 'FunctionCall': return printFunctionCall(node, opts, printNode);
        case 'Cast': return printCast(node, opts, printNode);
        case 'SubLink': return printSubLink(node, opts, printNode);
        case 'CaseExpr': return printCaseExpr(node, opts, printNode);
        case 'NullTest': return printNullTest(node, opts, printNode);
        case 'BooleanTest': return printBooleanTest(node, opts, printNode);
        case 'ResTarget': return printResTarget(node, opts, printNode);
        case 'RangeVar': return printRangeVar(node, opts);
        case 'JoinExpr': return printJoinExpr(node, opts, printNode);
        case 'Subquery': return printSubquery(node, opts, printNode);
        case 'RangeFunction': return printRangeFunction(node, opts, printNode);
        case 'SortItem': return printSortItem(node, opts, printNode);
        case 'ColumnDef': return printColumnDef(node, opts, printNode);
        case 'Constraint': return printConstraint(node, opts, printNode);
        case 'AlterCmd': return printAlterCmd(node, opts, printNode);
        case 'FunctionParam': return printFunctionParam(node, opts);
        case 'IndexElem': {
            const expr = prop(node, 'expr');
            const direction  = propStr(node, 'direction');
            const name = propStr(node, 'name');
            const base = expr ? printNode(expr) : (name ?? '');
            return direction ? [base, ' ', keyword(direction, opts)] : base;
        }
        case 'ExprList': return join(', ', propArr(node, 'items').map(printNode));
        case 'ArrayExpr': return printArrayExpr(node, opts, printNode);
        case 'Coalesce': return printCoalesce(node, opts, printNode);
        case 'RowExpr': return ['(', join(', ', propArr(node, 'args').map(printNode)), ')'];
        case 'ParamRef': return node.text ?? '$?';
        case 'SqlvalueFunction': return keyword(node.text ?? '', opts);
        case 'CTE': return printCteInline(node, opts, printNode);
        case 'WithClause': return '';
        case 'InExpr':         return printInExpr(node, opts, printNode);
        case 'BetweenExpr':    return printBetweenExpr(node, opts, printNode);
        case 'QuantifiedExpr': return printQuantifiedExpr(node, opts, printNode);
        case 'Subscript':      return printSubscript(node, opts, printNode);
        case 'NamedArg':       return printNamedArg(node, opts, printNode);
        case 'GroupingSet':    return printGroupingSet(node, opts, printNode);
        case 'GroupingFunc':     return printGroupingFunc(node, opts, printNode);
        case 'IntervalLiteral':  return printIntervalLiteral(node, opts, printNode);
        case 'RangeTableSample': return printRangeTableSample(node, opts, printNode);
        case 'TableLikeClause':  return printTableLikeClause(node, opts);
        case 'XmlExpr':          return printXmlExpr(node, opts, printNode);
        case 'JsonFuncExpr':     return printJsonFuncExpr(node, opts, printNode);
        default: return node.text ?? `/* unknown: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function printBinaryExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'op') ?? '?';
    const opDoc: Doc = /^[A-Z]/.test(op) ? keyword(op, opts) : op;
    return [left ? printNode(left) : '', ' ', opDoc, ' ', right ? printNode(right) : ''];
}

function printBoolExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const op = propStr(node, 'op') ?? 'AND';
    const args = propArr(node, 'args');

    if (op === 'NOT') {
        const arg = args[0];
        return [makeKeyword('NOT'), ' ', arg ? printNode(arg) : ''];
    }

    return join([hardline, makeKeyword(op), ' '], args.map(printNode));
}

function printFunctionCall(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword       = (kw: string) => keyword(kw, opts);
    const rawName  = propStr(node, 'name') ?? '';
    const args     = propArr(node, 'args');
    const star     = propBool(node, 'star');
    const distinct = propBool(node, 'distinct');
    const aggOrder = propArr(node, 'aggOrder');
    const filter   = prop(node, 'filter');
    const over     = prop(node, 'over');

    // SQL standard keyword-form functions — reconstruct readable syntax
    if (rawName.startsWith('pg_catalog.')) {
        const local = rawName.slice('pg_catalog.'.length);
        switch (local) {
            case 'substring': return printSubstringForm(args, opts, printNode);
            case 'extract':   return printExtractForm(args, opts, printNode);
            case 'ltrim':     return printTrimForm(args, 'LEADING',  opts, printNode);
            case 'rtrim':     return printTrimForm(args, 'TRAILING', opts, printNode);
            case 'btrim':     return printTrimForm(args, 'BOTH',     opts, printNode);
            case 'position':  return printPositionForm(args, opts, printNode);
            case 'timezone':  return printAtTimeZoneForm(args, opts, printNode);
            case 'overlay':   return printOverlayForm(args, opts, printNode);
        }
    }

    // Strip pg_catalog. schema prefix — it's an implementation detail, not user-facing
    const name = rawName.startsWith('pg_catalog.') ? rawName.slice('pg_catalog.'.length) : rawName;

    const argDocs: Doc[] = star ? [makeKeyword('*')] : args.map(printNode);
    const distinctPrefix: Doc = distinct ? [makeKeyword('DISTINCT'), ' '] : '';

    // ORDER BY inside the aggregate call: array_agg(x ORDER BY x)
    let innerDoc: Doc = [distinctPrefix, join(', ', argDocs)];
    if (aggOrder.length > 0) {
        innerDoc = [innerDoc, ' ', makeKeyword('ORDER BY'), ' ', join(', ', aggOrder.map(printNode))];
    }

    let callDoc: Doc = [makeKeyword(name), '(', innerDoc, ')'];

    // FILTER (WHERE ...) after the call, before OVER
    if (filter) {
        callDoc = [callDoc, ' ', makeKeyword('FILTER'), ' (', makeKeyword('WHERE'), ' ', printNode(filter), ')'];
    }

    if (!over) return callDoc;
    // Named window reference: OVER w (no inline spec)
    if (over.type === 'WindowRef') return [callDoc, ' ', makeKeyword('OVER'), ' ', over.text ?? ''];
    return [callDoc, ' ', makeKeyword('OVER'), ' (', printWindowDef(over, opts, printNode), ')'];
}

// SUBSTRING(str FROM pattern)  — 2 args: regex form
// SUBSTRING(str FROM pos FOR len) — 3 args: positional form
function printSubstringForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [str, fromExpr, forExpr] = args;
    if (!str) return makeKeyword('SUBSTRING') + '()';
    if (forExpr) {
        return [makeKeyword('SUBSTRING'), '(', printNode(str), ' ', makeKeyword('FROM'), ' ', printNode(fromExpr), ' ', makeKeyword('FOR'), ' ', printNode(forExpr), ')'];
    }
    return [makeKeyword('SUBSTRING'), '(', printNode(str), ' ', makeKeyword('FROM'), ' ', printNode(fromExpr ?? args[1]), ')'];
}

// EXTRACT(YEAR FROM expr)
function printExtractForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [fieldArg, sourceArg] = args;
    // fieldArg is a Literal whose text is "'year'" — strip quotes and apply keyword casing
    const raw = (fieldArg as any)?.text as string ?? '';
    const field = raw.replace(/^'|'$/g, '').toUpperCase();
    return [makeKeyword('EXTRACT'), '(', makeKeyword(field), ' ', makeKeyword('FROM'), ' ', sourceArg ? printNode(sourceArg) : '', ')'];
}

// TRIM(LEADING chars FROM str) / TRIM(TRAILING ...) / TRIM(BOTH ...)
function printTrimForm(args: SqlNode[], direction: string, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [str, chars] = args;
    if (!chars) {
        // 1-arg: trim spaces — use directional shorthand
        const fnName = direction === 'LEADING' ? 'LTRIM' : direction === 'TRAILING' ? 'RTRIM' : 'TRIM';
        return [makeKeyword(fnName), '(', str ? printNode(str) : '', ')'];
    }
    return [makeKeyword('TRIM'), '(', makeKeyword(direction), ' ', printNode(chars), ' ', makeKeyword('FROM'), ' ', printNode(str), ')'];
}

// POSITION(substr IN str)  — note: pg_catalog.position(str, substr) has reversed args
function printPositionForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [str, substr] = args;  // pg_catalog.position(haystack, needle)
    return [makeKeyword('POSITION'), '(', substr ? printNode(substr) : '', ' ', makeKeyword('IN'), ' ', str ? printNode(str) : '', ')'];
}

// ts AT TIME ZONE tz  — pg_catalog.timezone(tz, ts) has reversed args
function printAtTimeZoneForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [tz, ts] = args;  // pg_catalog.timezone(zone, timestamp)
    return [ts ? printNode(ts) : '', ' ', makeKeyword('AT TIME ZONE'), ' ', tz ? printNode(tz) : ''];
}

// OVERLAY(str PLACING sub FROM pos FOR len)
function printOverlayForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [str, placing, fromExpr, forExpr] = args;
    const doc: Doc[] = [
        makeKeyword('OVERLAY'), '(',
        str     ? printNode(str)     : '', ' ', makeKeyword('PLACING'), ' ',
        placing ? printNode(placing) : '', ' ', makeKeyword('FROM'), ' ',
        fromExpr ? printNode(fromExpr) : '',
    ];
    if (forExpr) doc.push(' ', makeKeyword('FOR'), ' ', printNode(forExpr));
    doc.push(')');
    return doc;
}

export function printWindowDef(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword          = (kw: string) => keyword(kw, opts);
    const partitionBy = propArr(node, 'partitionBy');
    const orderBy     = propArr(node, 'orderBy');
    const frameMode   = propStr(node, 'frameMode');
    const frameStart  = propStr(node, 'frameStart');
    const frameEnd    = propStr(node, 'frameEnd');
    const startOffset = prop(node, 'startOffset');
    const endOffset   = prop(node, 'endOffset');

    const parts: Doc[] = [];

    if (partitionBy.length > 0) {
        parts.push([makeKeyword('PARTITION BY'), ' ', join(', ', partitionBy.map(printNode))]);
    }
    if (orderBy.length > 0) {
        parts.push([makeKeyword('ORDER BY'), ' ', join(', ', orderBy.map(printNode))]);
    }
    if (frameMode) {
        const startDoc: Doc = startOffset
            ? [printNode(startOffset), ' ', makeKeyword(frameStart ?? '')]
            : makeKeyword(frameStart ?? '');
        if (frameEnd) {
            const endDoc: Doc = endOffset
                ? [printNode(endOffset), ' ', makeKeyword(frameEnd)]
                : makeKeyword(frameEnd);
            parts.push([makeKeyword(frameMode), ' ', makeKeyword('BETWEEN'), ' ', startDoc, ' ', makeKeyword('AND'), ' ', endDoc]);
        } else {
            parts.push([makeKeyword(frameMode), ' ', startDoc]);
        }
    }

    return join(' ', parts);
}

function printCast(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const arg = prop(node, 'arg');
    const typeName = propStr(node, 'typeName') ?? '';
    return [arg ? printNode(arg) : '', '::', keyword(typeName, opts)];
}

function printSubLink(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const type     = propStr(node, 'type') ?? 'SCALAR';
    const subquery = prop(node, 'subquery');
    const testexpr = prop(node, 'testexpr');
    const op       = propStr(node, 'op') ?? '=';
    const inner    = subquery ? printNode(subquery) : '';
    const subDoc: Doc = ['(', indent([hardline, inner]), hardline, ')'];

    if (type === 'EXISTS') return [makeKeyword('EXISTS'), ' ', subDoc];

    const lhs: Doc = testexpr ? [printNode(testexpr), ' '] : '';
    if (type === 'ANY') {
        // = ANY is SQL's IN
        return op === '=' ? [lhs, makeKeyword('IN'), ' ', subDoc]
                          : [lhs, op, ' ', makeKeyword('ANY'), ' ', subDoc];
    }
    if (type === 'ALL') return [lhs, op, ' ', makeKeyword('ALL'), ' ', subDoc];
    return subDoc;
}

function printCaseExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const whens = propArr(node, 'whens');
    const else_ = prop(node, 'else');

    const whenDocs = whens.map((w) => {
        const cond = prop(w, 'condition');
        const result = prop(w, 'result');
        return [makeKeyword('WHEN'), ' ', cond ? printNode(cond) : '', ' ', makeKeyword('THEN'), ' ', result ? printNode(result) : ''];
    });

    return [
        makeKeyword('CASE'), arg ? [' ', printNode(arg)] : '',
        indent([hardline, join(hardline, whenDocs)]),
        else_ ? [hardline, makeKeyword('ELSE'), ' ', printNode(else_)] : '',
        hardline, makeKeyword('END'),
    ];
}

function printNullTest(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const isNull = propBool(node, 'isNull');
    return [arg ? printNode(arg) : '', ' ', isNull ? makeKeyword('IS NULL') : makeKeyword('IS NOT NULL')];
}

function printBooleanTest(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const test = propStr(node, 'test') ?? '';
    return [arg ? printNode(arg) : '', ' ', makeKeyword('IS'), ' ', makeKeyword(test.replace(/_/g, ' '))];
}

function printResTarget(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const name = propStr(node, 'name');
    const val = prop(node, 'val');
    const expr = val ? printNode(val) : '';
    return [expr, aliasDoc(name, opts)];
}

// ---------------------------------------------------------------------------
// FROM items
// ---------------------------------------------------------------------------

function printRangeVar(node: SqlNode, opts: Options): Doc {
    return [rangeVarName(node), aliasDoc(propStr(node, 'alias'), opts)];
}

function printJoinExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (kw: string) => keyword(kw, opts);
    const joinType = propStr(node, 'joinType') ?? 'INNER';
    const lhs     = prop(node, 'lhs');
    const rhs     = prop(node, 'rhs');
    const on      = prop(node, 'on');
    const using   = (node.props?.['using'] as string[] | undefined) ?? [];

    const joinKw: Doc =
        joinType === 'CROSS'   ? makeKeyword('CROSS JOIN')
        : joinType === 'INNER'   ? makeKeyword('JOIN')
        : joinType === 'NATURAL' ? makeKeyword('NATURAL JOIN')
        : [makeKeyword(joinType), ' ', makeKeyword('JOIN')];

    const condition: Doc = joinType === 'CROSS' ? ''
        : on      ? [' ', makeKeyword('ON'), ' ', printNode(on)]
        : using.length > 0 ? [' ', makeKeyword('USING'), ' (', join(', ', using), ')']
        : '';

    return [lhs ? printNode(lhs) : '', hardline, joinKw, ' ', rhs ? printNode(rhs) : '', condition];
}

function printSubquery(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (kw: string) => keyword(kw, opts);
    const subquery = prop(node, 'subquery');
    const lateral  = propBool(node, 'lateral');
    const prefix: Doc = lateral ? [makeKeyword('LATERAL'), ' '] : '';
    return [prefix, '(', indent([hardline, subquery ? printNode(subquery) : '']), hardline, ')', aliasDoc(propStr(node, 'alias'), opts)];
}

function printRangeFunction(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    return [join(', ', propArr(node, 'functions').map(printNode)), aliasDoc(propStr(node, 'alias'), opts)];
}

// ---------------------------------------------------------------------------
// Sort / ORDER BY
// ---------------------------------------------------------------------------

function printSortItem(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const expr = prop(node, 'expr');
    const direction = propStr(node, 'direction');
    return [expr ? printNode(expr) : '', direction ? [' ', makeKeyword(direction)] : ''];
}

// ---------------------------------------------------------------------------
// DDL pieces
// ---------------------------------------------------------------------------

function printColumnDef(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    const constraints = propArr(node, 'constraints');
    const parts: Doc[] = [name, ' ', makeKeyword(typeName)];
    for (const c of constraints) {
        parts.push(' ', printConstraint(c, opts, printNode));
    }
    return parts;
}

function printConstraint(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const contype = propStr(node, 'contype') ?? '';
    const name = propStr(node, 'name');
    const expr = prop(node, 'expr');
    const pktable = prop(node, 'pktable');
    const fkAttrs = (node.props?.['fkAttrs'] as string[] | undefined) ?? [];
    const pkAttrs = (node.props?.['pkAttrs'] as string[] | undefined) ?? [];
    const keys = (node.props?.['keys'] as string[] | undefined) ?? [];
    const fkUpdAction = propStr(node, 'fkUpdAction');
    const fkDelAction = propStr(node, 'fkDelAction');
    const generatedWhen = propStr(node, 'generatedWhen');
    const nullsNotDistinct = propBool(node, 'nullsNotDistinct');
    const deferrable = propBool(node, 'deferrable');
    const initDeferred = propBool(node, 'initDeferred');

    const namePrefix: Doc = name ? [makeKeyword('CONSTRAINT'), ' ', name, ' '] : '';

    switch (contype) {
        case 'NULL':     return [namePrefix, makeKeyword('NULL')];
        case 'NOT NULL': return [namePrefix, makeKeyword('NOT NULL')];

        case 'DEFAULT':
            return [namePrefix, makeKeyword('DEFAULT'), expr ? [' ', printNode(expr)] : ''];

        case 'CHECK':
            return [namePrefix, makeKeyword('CHECK'), ' (', expr ? printNode(expr) : '', ')'];

        case 'PRIMARY KEY': {
            const colList: Doc = keys.length > 0 ? [' (', keys.join(', '), ')'] : '';
            return [namePrefix, makeKeyword('PRIMARY KEY'), colList];
        }

        case 'UNIQUE': {
            const colList: Doc = keys.length > 0 ? [' (', keys.join(', '), ')'] : '';
            const nnd: Doc = nullsNotDistinct ? [' ', makeKeyword('NULLS NOT DISTINCT')] : '';
            return [namePrefix, makeKeyword('UNIQUE'), nnd, colList];
        }

        case 'FOREIGN KEY': {
            // Column-level: REFERENCES table [(col, ...)] [ON UPDATE x] [ON DELETE y]
            // Table-level:  FOREIGN KEY (fkAttrs) REFERENCES table [(pkAttrs)]
            const fkColList: Doc = fkAttrs.length > 0 ? [' (', fkAttrs.join(', '), ')'] : '';
            const pkColList: Doc = pkAttrs.length > 0 ? [' (', pkAttrs.join(', '), ')'] : '';
            const pktableDoc: Doc = pktable ? printRangeVar(pktable, opts) : '';
            const onUpdate: Doc = fkUpdAction ? [' ', makeKeyword('ON UPDATE'), ' ', makeKeyword(fkUpdAction)] : '';
            const onDelete: Doc = fkDelAction ? [' ', makeKeyword('ON DELETE'), ' ', makeKeyword(fkDelAction)] : '';
            const deferrableDoc: Doc = deferrable
                ? [' ', makeKeyword('DEFERRABLE'), initDeferred ? [' ', makeKeyword('INITIALLY DEFERRED')] : [' ', makeKeyword('INITIALLY IMMEDIATE')]]
                : '';
            if (fkAttrs.length > 0) {
                // table-level
                return [namePrefix, makeKeyword('FOREIGN KEY'), fkColList, ' ', makeKeyword('REFERENCES'), ' ', pktableDoc, pkColList, onUpdate, onDelete, deferrableDoc];
            }
            // column-level
            return [namePrefix, makeKeyword('REFERENCES'), ' ', pktableDoc, pkColList, onUpdate, onDelete, deferrableDoc];
        }

        case 'IDENTITY': {
            const when: Doc = generatedWhen ? makeKeyword(generatedWhen) : makeKeyword('BY DEFAULT');
            return [namePrefix, makeKeyword('GENERATED'), ' ', when, ' ', makeKeyword('AS IDENTITY')];
        }

        case 'GENERATED': {
            return [namePrefix, makeKeyword('GENERATED ALWAYS AS'), ' (', expr ? printNode(expr) : '', ') ', makeKeyword('STORED')];
        }

        default:
            return [namePrefix, makeKeyword(contype)];
    }
}

function printAlterCmd(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (kw: string) => keyword(kw, opts);
    const subtype = propStr(node, 'subtype') ?? '';
    const name    = propStr(node, 'name') ?? '';
    const newType = propStr(node, 'newType');
    const expr    = prop(node, 'expr');
    const def     = prop(node, 'def');
    const ifExists: Doc = propBool(node, 'ifExists') ? [makeKeyword('IF EXISTS'), ' '] : '';

    switch (subtype) {
        case 'ADD COLUMN':
            return [makeKeyword('ADD COLUMN'), ' ', ifExists, def ? printNode(def) : name];
        case 'DROP COLUMN':
            return [makeKeyword('DROP COLUMN'), ' ', ifExists, name];
        case 'ADD CONSTRAINT':
            return [makeKeyword('ADD'), ' ', def ? printNode(def) : name];
        case 'ALTER COLUMN TYPE':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('TYPE'), ' ', newType ? makeKeyword(newType) : ''];
        case 'SET DEFAULT':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET DEFAULT'), ' ', expr ? printNode(expr) : ''];
        case 'DROP DEFAULT':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP DEFAULT')];
        case 'SET NOT NULL':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET NOT NULL')];
        case 'DROP NOT NULL':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP NOT NULL')];
        default:
            return [makeKeyword(subtype), name ? [' ', name] : ''];
    }
}

function printFunctionParam(node: SqlNode, opts: Options): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    const mode = propStr(node, 'mode');
    const modePrefix = mode ? [makeKeyword(mode), ' '] : '';
    return [modePrefix, name ? [name, ' '] : '', makeKeyword(typeName)];
}

// ---------------------------------------------------------------------------
// Arrays / misc
// ---------------------------------------------------------------------------

function printArrayExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const elements = propArr(node, 'elements');
    return [makeKeyword('ARRAY'), '[', join(', ', elements.map(printNode)), ']'];
}

function printCoalesce(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const args = propArr(node, 'args');
    return [makeKeyword('COALESCE'), '(', join(', ', args.map(printNode)), ')'];
}

function printCteInline(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const query = prop(node, 'query');
    return [name, ' ', makeKeyword('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
}

// ---------------------------------------------------------------------------
// IN / BETWEEN / Quantified (ANY, ALL)
// ---------------------------------------------------------------------------

function printInExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword     = (kw: string) => keyword(kw, opts);
    const left   = prop(node, 'left');
    const not    = propBool(node, 'not');
    const values = prop(node, 'values');
    const keywordDoc     = not ? makeKeyword('NOT IN') : makeKeyword('IN');

    // values is an ExprList node; its items are the IN list
    const items  = values ? propArr(values, 'items').map(printNode) : [];
    return [left ? printNode(left) : '', ' ', keywordDoc, ' (', join(', ', items), ')'];
}

function printBetweenExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword        = (kw: string) => keyword(kw, opts);
    const arg       = prop(node, 'arg');
    const not       = propBool(node, 'not');
    const symmetric = propBool(node, 'symmetric');
    const low       = prop(node, 'low');
    const high      = prop(node, 'high');

    const keywordDoc = not
        ? (symmetric ? makeKeyword('NOT BETWEEN SYMMETRIC') : makeKeyword('NOT BETWEEN'))
        : (symmetric ? makeKeyword('BETWEEN SYMMETRIC')     : makeKeyword('BETWEEN'));

    return [
        arg  ? printNode(arg)  : '',
        ' ', keywordDoc, ' ',
        low  ? printNode(low)  : '',
        ' ', makeKeyword('AND'), ' ',
        high ? printNode(high) : '',
    ];
}

function printQuantifiedExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword         = (kw: string) => keyword(kw, opts);
    const left       = prop(node, 'left');
    const right      = prop(node, 'right');
    const op         = propStr(node, 'op') ?? '=';
    const quantifier = propStr(node, 'quantifier') ?? 'ANY';
    // right is typically an array literal or subquery
    return [left ? printNode(left) : '', ' ', op, ' ', makeKeyword(quantifier), '(', right ? printNode(right) : '', ')'];
}

function printIntervalLiteral(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword    = (kw: string) => keyword(kw, opts);
    const value = prop(node, 'value');
    const field = propStr(node, 'field');
    return [makeKeyword('INTERVAL'), ' ', value ? printNode(value) : '', field ? [' ', makeKeyword(field)] : ''];
}

function printRangeTableSample(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword         = (kw: string) => keyword(kw, opts);
    const relation   = prop(node, 'relation');
    const method     = propStr(node, 'method') ?? 'bernoulli';
    const args       = propArr(node, 'args');
    const repeatable = prop(node, 'repeatable');

    return [
        relation ? printNode(relation) : '',
        ' ', makeKeyword('TABLESAMPLE'), ' ', makeKeyword(method.toUpperCase()),
        '(', join(', ', args.map(printNode)), ')',
        repeatable ? [' ', makeKeyword('REPEATABLE'), ' (', printNode(repeatable), ')'] : '',
    ];
}

function printTableLikeClause(node: SqlNode, opts: Options): Doc {
    const makeKeyword        = (kw: string) => keyword(kw, opts);
    const relation  = prop(node, 'relation');
    const including = (node.props?.['including'] as string[] | undefined) ?? [];
    return [
        makeKeyword('LIKE'), ' ', rangeVarName(relation),
        ...including.map((opt) => [' ', makeKeyword('INCLUDING'), ' ', makeKeyword(opt)] as Doc),
    ];
}

function printSubscript(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    const arg = prop(node, 'arg');
    const subscripts = propArr(node, 'subscripts');
    const base: Doc = arg ? printNode(arg) : '';
    const parts: Doc[] = subscripts.map((s): Doc => {
        if (s.type === 'SubscriptIndex') {
            const index = prop(s, 'index');
            return ['[', index ? printNode(index) : '', ']'];
        }
        if (s.type === 'SubscriptSlice') {
            const lower = prop(s, 'lower');
            const upper = prop(s, 'upper');
            return ['[', lower ? printNode(lower) : '', ':', upper ? printNode(upper) : '', ']'];
        }
        if (s.type === 'FieldAccess') return ['.', s.text ?? ''];
        return '';
    });
    return [base, ...parts];
}

function printNamedArg(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    const name = propStr(node, 'name') ?? '';
    const arg = prop(node, 'arg');
    return [name, ' => ', arg ? printNode(arg) : ''];
}

function printGroupingSet(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const kind = propStr(node, 'kind') ?? '';
    const content = propArr(node, 'content');

    if (kind === 'EMPTY') return '()';
    if (kind === 'SIMPLE') return ['(', join(', ', content.map(printNode)), ')'];

    const printItem = (item: SqlNode): Doc =>
        item.type === 'GroupingSet' ? printGroupingSet(item, opts, printNode) : printNode(item);
    // Inside GROUPING SETS: GroupingSet and RowExpr already carry their own parens;
    // bare column refs need them added: (col) not col
    const printSetItem = (item: SqlNode): Doc =>
        item.type === 'GroupingSet' ? printGroupingSet(item, opts, printNode)
        : item.type === 'RowExpr'   ? printNode(item)
        : ['(', printNode(item), ')'];

    if (kind === 'ROLLUP') return [makeKeyword('ROLLUP'), '(', join(', ', content.map(printItem)), ')'];
    if (kind === 'CUBE')   return [makeKeyword('CUBE'),   '(', join(', ', content.map(printItem)), ')'];
    if (kind === 'SETS')   return [makeKeyword('GROUPING SETS'), '(', join(', ', content.map(printSetItem)), ')'];
    return [makeKeyword(kind), '(', join(', ', content.map(printItem)), ')'];
}

function printGroupingFunc(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword   = (kw: string) => keyword(kw, opts);
    const args = propArr(node, 'args');
    return [makeKeyword('GROUPING'), '(', join(', ', args.map(printNode)), ')'];
}

function printXmlExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword        = (kw: string) => keyword(kw, opts);
    const op        = propStr(node, 'op') ?? 'XMLEXPR';
    const name      = propStr(node, 'name');
    const args      = propArr(node, 'args');
    const namedArgs = propArr(node, 'namedArgs');

    if (op === 'XMLELEMENT') {
        const parts: Doc[] = [makeKeyword('NAME'), ' ', name ?? ''];
        if (namedArgs.length > 0) {
            // namedArgs correspond to xmlattributes() arguments
            const attrItems = namedArgs.map((a) => {
                const alias  = propStr(a, 'name');
                const val    = prop(a, 'val');
                const valDoc = val ? printNode(val) : '';
                return alias ? [valDoc, ' ', makeKeyword('AS'), ' ', alias] as Doc : valDoc;
            });
            parts.push(', ', makeKeyword('XMLATTRIBUTES'), '(', join(', ', attrItems), ')');
        }
        for (const a of args) parts.push(', ', printNode(a));
        return [makeKeyword('XMLELEMENT'), '(', ...parts, ')'];
    }
    if (op === 'XMLFOREST') {
        const items = namedArgs.map((a) => {
            const alias = propStr(a, 'name');
            const val   = prop(a, 'val');
            const valDoc = val ? printNode(val) : '';
            return alias ? [valDoc, ' ', makeKeyword('AS'), ' ', alias] as Doc : valDoc;
        });
        return [makeKeyword('XMLFOREST'), '(', join(', ', items), ')'];
    }
    if (op === 'XMLPI') {
        const items: Doc[] = [makeKeyword('NAME'), ' ', name ?? ''];
        if (args.length > 0) items.push(', ', printNode(args[0]!));
        return [makeKeyword('XMLPI'), '(', ...items, ')'];
    }
    // XMLCONCAT, XMLPARSE, XMLROOT, XMLSERIALIZE — simple arg list
    const allArgs = [...namedArgs, ...args].map(printNode);
    return [makeKeyword(op), '(', join(', ', allArgs), ')'];
}

function printJsonFuncExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword        = (kw: string) => keyword(kw, opts);
    const op        = propStr(node, 'op') ?? 'JSON_QUERY';
    const context   = prop(node, 'context');
    const path      = prop(node, 'path');
    const returning = propStr(node, 'returning');

    const parts: Doc[] = [
        context ? printNode(context) : '',
        ', ',
        path ? printNode(path) : '',
    ];
    if (returning) parts.push(' ', makeKeyword('RETURNING'), ' ', returning);
    return [makeKeyword(op), '(', ...parts, ')'];
}
