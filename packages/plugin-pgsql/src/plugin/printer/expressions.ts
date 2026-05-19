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
            const dir  = propStr(node, 'direction');
            const name = propStr(node, 'name');
            const base = expr ? printNode(expr) : (name ?? '');
            return dir ? [base, ' ', keyword(dir, opts)] : base;
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

function printBinaryExpr(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'op') ?? '?';
    return [left ? printNode(left) : '', ' ', op, ' ', right ? printNode(right) : ''];
}

function printBoolExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const op = propStr(node, 'op') ?? 'AND';
    const args = propArr(node, 'args');

    if (op === 'NOT') {
        const arg = args[0];
        return [mk('NOT'), ' ', arg ? printNode(arg) : ''];
    }

    return join([hardline, mk(op), ' '], args.map(printNode));
}

function printFunctionCall(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk       = (kw: string) => keyword(kw, opts);
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

    const argDocs: Doc[] = star ? [mk('*')] : args.map(printNode);
    if (distinct) argDocs.unshift(mk('DISTINCT'), ' ');

    // ORDER BY inside the aggregate call: array_agg(x ORDER BY x)
    let innerDoc: Doc = join(', ', argDocs);
    if (aggOrder.length > 0) {
        innerDoc = [innerDoc, ' ', mk('ORDER BY'), ' ', join(', ', aggOrder.map(printNode))];
    }

    let callDoc: Doc = [mk(name), '(', innerDoc, ')'];

    // FILTER (WHERE ...) after the call, before OVER
    if (filter) {
        callDoc = [callDoc, ' ', mk('FILTER'), ' (', mk('WHERE'), ' ', printNode(filter), ')'];
    }

    if (!over) return callDoc;
    // Named window reference: OVER w (no inline spec)
    if (over.type === 'WindowRef') return [callDoc, ' ', mk('OVER'), ' ', over.text ?? ''];
    return [callDoc, ' ', mk('OVER'), ' (', printWindowDef(over, opts, printNode), ')'];
}

// SUBSTRING(str FROM pattern)  — 2 args: regex form
// SUBSTRING(str FROM pos FOR len) — 3 args: positional form
function printSubstringForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [str, fromExpr, forExpr] = args;
    if (!str) return mk('SUBSTRING') + '()';
    if (forExpr) {
        return [mk('SUBSTRING'), '(', printNode(str), ' ', mk('FROM'), ' ', printNode(fromExpr), ' ', mk('FOR'), ' ', printNode(forExpr), ')'];
    }
    return [mk('SUBSTRING'), '(', printNode(str), ' ', mk('FROM'), ' ', printNode(fromExpr ?? args[1]), ')'];
}

// EXTRACT(YEAR FROM expr)
function printExtractForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [fieldArg, sourceArg] = args;
    // fieldArg is a Literal whose text is "'year'" — strip quotes and apply keyword casing
    const raw = (fieldArg as any)?.text as string ?? '';
    const field = raw.replace(/^'|'$/g, '').toUpperCase();
    return [mk('EXTRACT'), '(', mk(field), ' ', mk('FROM'), ' ', sourceArg ? printNode(sourceArg) : '', ')'];
}

// TRIM(LEADING chars FROM str) / TRIM(TRAILING ...) / TRIM(BOTH ...)
function printTrimForm(args: SqlNode[], direction: string, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [str, chars] = args;
    if (!chars) {
        // 1-arg: trim spaces — use directional shorthand
        const fnName = direction === 'LEADING' ? 'LTRIM' : direction === 'TRAILING' ? 'RTRIM' : 'TRIM';
        return [mk(fnName), '(', str ? printNode(str) : '', ')'];
    }
    return [mk('TRIM'), '(', mk(direction), ' ', printNode(chars), ' ', mk('FROM'), ' ', printNode(str), ')'];
}

// POSITION(substr IN str)  — note: pg_catalog.position(str, substr) has reversed args
function printPositionForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [str, substr] = args;  // pg_catalog.position(haystack, needle)
    return [mk('POSITION'), '(', substr ? printNode(substr) : '', ' ', mk('IN'), ' ', str ? printNode(str) : '', ')'];
}

// ts AT TIME ZONE tz  — pg_catalog.timezone(tz, ts) has reversed args
function printAtTimeZoneForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [tz, ts] = args;  // pg_catalog.timezone(zone, timestamp)
    return [ts ? printNode(ts) : '', ' ', mk('AT TIME ZONE'), ' ', tz ? printNode(tz) : ''];
}

// OVERLAY(str PLACING sub FROM pos FOR len)
function printOverlayForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const [str, placing, fromExpr, forExpr] = args;
    const doc: Doc[] = [
        mk('OVERLAY'), '(',
        str     ? printNode(str)     : '', ' ', mk('PLACING'), ' ',
        placing ? printNode(placing) : '', ' ', mk('FROM'), ' ',
        fromExpr ? printNode(fromExpr) : '',
    ];
    if (forExpr) doc.push(' ', mk('FOR'), ' ', printNode(forExpr));
    doc.push(')');
    return doc;
}

export function printWindowDef(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk          = (kw: string) => keyword(kw, opts);
    const partitionBy = propArr(node, 'partitionBy');
    const orderBy     = propArr(node, 'orderBy');
    const frameMode   = propStr(node, 'frameMode');
    const frameStart  = propStr(node, 'frameStart');
    const frameEnd    = propStr(node, 'frameEnd');
    const startOffset = prop(node, 'startOffset');
    const endOffset   = prop(node, 'endOffset');

    const parts: Doc[] = [];

    if (partitionBy.length > 0) {
        parts.push([mk('PARTITION BY'), ' ', join(', ', partitionBy.map(printNode))]);
    }
    if (orderBy.length > 0) {
        parts.push([mk('ORDER BY'), ' ', join(', ', orderBy.map(printNode))]);
    }
    if (frameMode) {
        const startDoc: Doc = startOffset
            ? [printNode(startOffset), ' ', mk(frameStart ?? '')]
            : mk(frameStart ?? '');
        if (frameEnd) {
            const endDoc: Doc = endOffset
                ? [printNode(endOffset), ' ', mk(frameEnd)]
                : mk(frameEnd);
            parts.push([mk(frameMode), ' ', mk('BETWEEN'), ' ', startDoc, ' ', mk('AND'), ' ', endDoc]);
        } else {
            parts.push([mk(frameMode), ' ', startDoc]);
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
    const mk = (kw: string) => keyword(kw, opts);
    const type = propStr(node, 'type') ?? 'SCALAR';
    const subquery = prop(node, 'subquery');
    const inner = subquery ? printNode(subquery) : '';

    if (type === 'EXISTS') {
        return [mk('EXISTS'), ' (', indent([hardline, inner]), hardline, ')'];
    }
    return ['(', indent([hardline, inner]), hardline, ')'];
}

function printCaseExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const whens = propArr(node, 'whens');
    const else_ = prop(node, 'else');

    const whenDocs = whens.map((w) => {
        const cond = prop(w, 'condition');
        const result = prop(w, 'result');
        return [mk('WHEN'), ' ', cond ? printNode(cond) : '', ' ', mk('THEN'), ' ', result ? printNode(result) : ''];
    });

    return [
        mk('CASE'), arg ? [' ', printNode(arg)] : '',
        indent([hardline, join(hardline, whenDocs)]),
        else_ ? [hardline, mk('ELSE'), ' ', printNode(else_)] : '',
        hardline, mk('END'),
    ];
}

function printNullTest(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const isNull = propBool(node, 'isNull');
    return [arg ? printNode(arg) : '', ' ', isNull ? mk('IS NULL') : mk('IS NOT NULL')];
}

function printBooleanTest(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const test = propStr(node, 'test') ?? '';
    return [arg ? printNode(arg) : '', ' ', mk('IS'), ' ', mk(test.replace(/_/g, ' '))];
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
    const mk      = (kw: string) => keyword(kw, opts);
    const joinType = propStr(node, 'joinType') ?? 'INNER';
    const lhs     = prop(node, 'lhs');
    const rhs     = prop(node, 'rhs');
    const on      = prop(node, 'on');
    const using   = propArr(node, 'using');

    const joinKw: Doc =
        joinType === 'CROSS'   ? mk('CROSS JOIN')
        : joinType === 'INNER'   ? mk('JOIN')
        : joinType === 'NATURAL' ? mk('NATURAL JOIN')
        : [mk(joinType), ' ', mk('JOIN')];

    const condition: Doc = joinType === 'CROSS' ? ''
        : on      ? [' ', mk('ON'), ' ', printNode(on)]
        : using.length > 0 ? [' ', mk('USING'), ' (', join(', ', using.map(printNode)), ')']
        : '';

    return [lhs ? printNode(lhs) : '', hardline, joinKw, ' ', rhs ? printNode(rhs) : '', condition];
}

function printSubquery(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk      = (kw: string) => keyword(kw, opts);
    const subquery = prop(node, 'subquery');
    const lateral  = propBool(node, 'lateral');
    const prefix: Doc = lateral ? [mk('LATERAL'), ' '] : '';
    return [prefix, '(', indent([hardline, subquery ? printNode(subquery) : '']), hardline, ')', aliasDoc(propStr(node, 'alias'), opts)];
}

function printRangeFunction(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    return [join(', ', propArr(node, 'functions').map(printNode)), aliasDoc(propStr(node, 'alias'), opts)];
}

// ---------------------------------------------------------------------------
// Sort / ORDER BY
// ---------------------------------------------------------------------------

function printSortItem(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const expr = prop(node, 'expr');
    const dir = propStr(node, 'direction');
    return [expr ? printNode(expr) : '', dir ? [' ', mk(dir)] : ''];
}

// ---------------------------------------------------------------------------
// DDL pieces
// ---------------------------------------------------------------------------

function printColumnDef(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    const constraints = propArr(node, 'constraints');
    const parts: Doc[] = [name, ' ', mk(typeName)];
    for (const c of constraints) {
        parts.push(' ', printConstraint(c, opts, printNode));
    }
    return parts;
}

function printConstraint(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
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

    const namePrefix: Doc = name ? [mk('CONSTRAINT'), ' ', name, ' '] : '';

    switch (contype) {
        case 'NULL':     return [namePrefix, mk('NULL')];
        case 'NOT NULL': return [namePrefix, mk('NOT NULL')];

        case 'DEFAULT':
            return [namePrefix, mk('DEFAULT'), expr ? [' ', printNode(expr)] : ''];

        case 'CHECK':
            return [namePrefix, mk('CHECK'), ' (', expr ? printNode(expr) : '', ')'];

        case 'PRIMARY KEY': {
            const colList: Doc = keys.length > 0 ? [' (', keys.join(', '), ')'] : '';
            return [namePrefix, mk('PRIMARY KEY'), colList];
        }

        case 'UNIQUE': {
            const colList: Doc = keys.length > 0 ? [' (', keys.join(', '), ')'] : '';
            const nnd: Doc = nullsNotDistinct ? [' ', mk('NULLS NOT DISTINCT')] : '';
            return [namePrefix, mk('UNIQUE'), nnd, colList];
        }

        case 'FOREIGN KEY': {
            // Column-level: REFERENCES table [(col, ...)] [ON UPDATE x] [ON DELETE y]
            // Table-level:  FOREIGN KEY (fkAttrs) REFERENCES table [(pkAttrs)]
            const fkColList: Doc = fkAttrs.length > 0 ? [' (', fkAttrs.join(', '), ')'] : '';
            const pkColList: Doc = pkAttrs.length > 0 ? [' (', pkAttrs.join(', '), ')'] : '';
            const pktableDoc: Doc = pktable ? printRangeVar(pktable, opts) : '';
            const onUpdate: Doc = fkUpdAction ? [' ', mk('ON UPDATE'), ' ', mk(fkUpdAction)] : '';
            const onDelete: Doc = fkDelAction ? [' ', mk('ON DELETE'), ' ', mk(fkDelAction)] : '';
            const deferrableDoc: Doc = deferrable
                ? [' ', mk('DEFERRABLE'), initDeferred ? [' ', mk('INITIALLY DEFERRED')] : [' ', mk('INITIALLY IMMEDIATE')]]
                : '';
            if (fkAttrs.length > 0) {
                // table-level
                return [namePrefix, mk('FOREIGN KEY'), fkColList, ' ', mk('REFERENCES'), ' ', pktableDoc, pkColList, onUpdate, onDelete, deferrableDoc];
            }
            // column-level
            return [namePrefix, mk('REFERENCES'), ' ', pktableDoc, pkColList, onUpdate, onDelete, deferrableDoc];
        }

        case 'IDENTITY': {
            const when: Doc = generatedWhen ? mk(generatedWhen) : mk('BY DEFAULT');
            return [namePrefix, mk('GENERATED'), ' ', when, ' ', mk('AS IDENTITY')];
        }

        case 'GENERATED': {
            return [namePrefix, mk('GENERATED ALWAYS AS'), ' (', expr ? printNode(expr) : '', ') ', mk('STORED')];
        }

        default:
            return [namePrefix, mk(contype)];
    }
}

function printAlterCmd(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk      = (kw: string) => keyword(kw, opts);
    const subtype = propStr(node, 'subtype') ?? '';
    const name    = propStr(node, 'name') ?? '';
    const newType = propStr(node, 'newType');
    const expr    = prop(node, 'expr');
    const def     = prop(node, 'def');
    const ifExists: Doc = propBool(node, 'ifExists') ? [mk('IF EXISTS'), ' '] : '';

    switch (subtype) {
        case 'ADD COLUMN':
            return [mk('ADD COLUMN'), ' ', ifExists, def ? printNode(def) : name];
        case 'DROP COLUMN':
            return [mk('DROP COLUMN'), ' ', ifExists, name];
        case 'ADD CONSTRAINT':
            return [mk('ADD'), ' ', def ? printNode(def) : name];
        case 'ALTER COLUMN TYPE':
            return [mk('ALTER COLUMN'), ' ', name, ' ', mk('TYPE'), ' ', newType ? mk(newType) : ''];
        case 'SET DEFAULT':
            return [mk('ALTER COLUMN'), ' ', name, ' ', mk('SET DEFAULT'), ' ', expr ? printNode(expr) : ''];
        case 'DROP DEFAULT':
            return [mk('ALTER COLUMN'), ' ', name, ' ', mk('DROP DEFAULT')];
        case 'SET NOT NULL':
            return [mk('ALTER COLUMN'), ' ', name, ' ', mk('SET NOT NULL')];
        case 'DROP NOT NULL':
            return [mk('ALTER COLUMN'), ' ', name, ' ', mk('DROP NOT NULL')];
        default:
            return [mk(subtype), name ? [' ', name] : ''];
    }
}

function printFunctionParam(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    const mode = propStr(node, 'mode');
    const modePrefix = mode && mode !== 'FuncParamDefault' ? [mk(mode), ' '] : '';
    return [modePrefix, name ? [name, ' '] : '', mk(typeName)];
}

// ---------------------------------------------------------------------------
// Arrays / misc
// ---------------------------------------------------------------------------

function printArrayExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const elements = propArr(node, 'elements');
    return [mk('ARRAY'), '[', join(', ', elements.map(printNode)), ']'];
}

function printCoalesce(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const args = propArr(node, 'args');
    return [mk('COALESCE'), '(', join(', ', args.map(printNode)), ')'];
}

function printCteInline(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const query = prop(node, 'query');
    return [name, ' ', mk('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')'];
}

// ---------------------------------------------------------------------------
// IN / BETWEEN / Quantified (ANY, ALL)
// ---------------------------------------------------------------------------

function printInExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk     = (kw: string) => keyword(kw, opts);
    const left   = prop(node, 'left');
    const not    = propBool(node, 'not');
    const values = prop(node, 'values');
    const kw     = not ? mk('NOT IN') : mk('IN');

    // values is an ExprList node; its items are the IN list
    const items  = values ? propArr(values, 'items').map(printNode) : [];
    return [left ? printNode(left) : '', ' ', kw, ' (', join(', ', items), ')'];
}

function printBetweenExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk        = (kw: string) => keyword(kw, opts);
    const arg       = prop(node, 'arg');
    const not       = propBool(node, 'not');
    const symmetric = propBool(node, 'symmetric');
    const low       = prop(node, 'low');
    const high      = prop(node, 'high');

    const kw = not
        ? (symmetric ? mk('NOT BETWEEN SYMMETRIC') : mk('NOT BETWEEN'))
        : (symmetric ? mk('BETWEEN SYMMETRIC')     : mk('BETWEEN'));

    return [
        arg  ? printNode(arg)  : '',
        ' ', kw, ' ',
        low  ? printNode(low)  : '',
        ' ', mk('AND'), ' ',
        high ? printNode(high) : '',
    ];
}

function printQuantifiedExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk         = (kw: string) => keyword(kw, opts);
    const left       = prop(node, 'left');
    const right      = prop(node, 'right');
    const op         = propStr(node, 'op') ?? '=';
    const quantifier = propStr(node, 'quantifier') ?? 'ANY';
    // right is typically an array literal or subquery
    return [left ? printNode(left) : '', ' ', op, ' ', mk(quantifier), '(', right ? printNode(right) : '', ')'];
}

function printIntervalLiteral(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk    = (kw: string) => keyword(kw, opts);
    const value = prop(node, 'value');
    const field = propStr(node, 'field');
    return [mk('INTERVAL'), ' ', value ? printNode(value) : '', field ? [' ', mk(field)] : ''];
}

function printRangeTableSample(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk         = (kw: string) => keyword(kw, opts);
    const relation   = prop(node, 'relation');
    const method     = propStr(node, 'method') ?? 'bernoulli';
    const args       = propArr(node, 'args');
    const repeatable = prop(node, 'repeatable');

    return [
        relation ? printNode(relation) : '',
        ' ', mk('TABLESAMPLE'), ' ', mk(method.toUpperCase()),
        '(', join(', ', args.map(printNode)), ')',
        repeatable ? [' ', mk('REPEATABLE'), ' (', printNode(repeatable), ')'] : '',
    ];
}

function printTableLikeClause(node: SqlNode, opts: Options): Doc {
    const mk        = (kw: string) => keyword(kw, opts);
    const relation  = prop(node, 'relation');
    const including = (node.props?.['including'] as string[] | undefined) ?? [];
    return [
        mk('LIKE'), ' ', rangeVarName(relation),
        ...including.map((opt) => [' ', mk('INCLUDING'), ' ', mk(opt)] as Doc),
    ];
}

function printSubscript(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    const arg = prop(node, 'arg');
    const subscripts = propArr(node, 'subscripts');
    const base: Doc = arg ? printNode(arg) : '';
    const parts: Doc[] = subscripts.map((s): Doc => {
        if (s.type === 'SubscriptIndex') {
            const idx = prop(s, 'index');
            return ['[', idx ? printNode(idx) : '', ']'];
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
    const mk = (kw: string) => keyword(kw, opts);
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

    if (kind === 'ROLLUP') return [mk('ROLLUP'), '(', join(', ', content.map(printItem)), ')'];
    if (kind === 'CUBE')   return [mk('CUBE'),   '(', join(', ', content.map(printItem)), ')'];
    if (kind === 'SETS')   return [mk('GROUPING SETS'), '(', join(', ', content.map(printSetItem)), ')'];
    return [mk(kind), '(', join(', ', content.map(printItem)), ')'];
}

function printGroupingFunc(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk   = (kw: string) => keyword(kw, opts);
    const args = propArr(node, 'args');
    return [mk('GROUPING'), '(', join(', ', args.map(printNode)), ')'];
}

function printXmlExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk        = (kw: string) => keyword(kw, opts);
    const op        = propStr(node, 'op') ?? 'XMLEXPR';
    const name      = propStr(node, 'name');
    const args      = propArr(node, 'args');
    const namedArgs = propArr(node, 'namedArgs');

    if (op === 'XMLELEMENT') {
        const parts: Doc[] = [mk('NAME'), ' ', name ?? ''];
        if (namedArgs.length > 0) {
            // namedArgs correspond to xmlattributes() arguments
            const attrItems = namedArgs.map((a) => {
                const alias  = propStr(a, 'name');
                const val    = prop(a, 'val');
                const valDoc = val ? printNode(val) : '';
                return alias ? [valDoc, ' ', mk('AS'), ' ', alias] as Doc : valDoc;
            });
            parts.push(', ', mk('XMLATTRIBUTES'), '(', join(', ', attrItems), ')');
        }
        for (const a of args) parts.push(', ', printNode(a));
        return [mk('XMLELEMENT'), '(', ...parts, ')'];
    }
    if (op === 'XMLFOREST') {
        const items = namedArgs.map((a) => {
            const alias = propStr(a, 'name');
            const val   = prop(a, 'val');
            const valDoc = val ? printNode(val) : '';
            return alias ? [valDoc, ' ', mk('AS'), ' ', alias] as Doc : valDoc;
        });
        return [mk('XMLFOREST'), '(', join(', ', items), ')'];
    }
    if (op === 'XMLPI') {
        const items: Doc[] = [mk('NAME'), ' ', name ?? ''];
        if (args.length > 0) items.push(', ', printNode(args[0]!));
        return [mk('XMLPI'), '(', ...items, ')'];
    }
    // XMLCONCAT, XMLPARSE, XMLROOT, XMLSERIALIZE — simple arg list
    const allArgs = [...namedArgs, ...args].map(printNode);
    return [mk(op), '(', join(', ', allArgs), ')'];
}

function printJsonFuncExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk        = (kw: string) => keyword(kw, opts);
    const op        = propStr(node, 'op') ?? 'JSON_QUERY';
    const context   = prop(node, 'context');
    const path      = prop(node, 'path');
    const returning = propStr(node, 'returning');

    const parts: Doc[] = [
        context ? printNode(context) : '',
        ', ',
        path ? printNode(path) : '',
    ];
    if (returning) parts.push(' ', mk('RETURNING'), ' ', returning);
    return [mk(op), '(', ...parts, ')'];
}
