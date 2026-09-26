import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options, PrintFn } from '@prettier-sql/core/printer/utils';
import { keyword, join, indent, hardline, softline, group, fill, line, getDensity, aliasDoc } from '@prettier-sql/core/printer/utils';
import { printStatement, printQueryExpr } from './statements.js';
import { prop, propArr, propStr, propBool, propStrArr, rangeVarName, onlyPrefix } from './helpers.js';

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
        case 'FunctionParam': return printFunctionParam(node, opts, printNode);
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
        case 'JsonFuncExpr':          return printJsonFuncExpr(node, opts, printNode);
        case 'XmlTable':              return printXmlTable(node, opts, printNode);
        case 'JsonTable':             return printJsonTable(node, opts, printNode);
        // SQL/JSON constructors — PostgreSQL 16+
        case 'JsonObjectConstructor': return printJsonObjectConstructor(node, opts, printNode);
        case 'JsonArrayConstructor':  return printJsonArrayConstructor(node, opts, printNode);
        case 'JsonObjectAgg':         return printJsonObjectAgg(node, opts, printNode);
        case 'JsonArrayAgg':          return printJsonArrayAgg(node, opts, printNode);
        default: return node.text ?? `/* unknown: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// Operator precedence
//
// libpg_query's AST has no node for parentheses, so the printer has to put them
// back wherever an operand binds more loosely than its parent operator —
// otherwise `(a + b) * c` would print as `a + b * c`. Levels follow the
// PostgreSQL operator precedence table; higher binds tighter.
// ---------------------------------------------------------------------------

export const PREC = {
    OR: 1,
    AND: 2,
    NOT: 3,
    IS: 4,          // IS NULL, IS TRUE, IS DISTINCT FROM, …
    COMPARISON: 5,  // = <> < > <= >=
    LIKE: 6,        // LIKE ILIKE SIMILAR TO BETWEEN IN
    OTHER: 7,       // any other operator: || -> @> ~ …
    ADD: 8,         // + -
    MUL: 9,         // * / %
    EXP: 10,        // ^
    AT: 11,         // AT TIME ZONE
    UNARY: 12,      // unary minus / plus
    CAST: 13,       // ::
    ATOM: 14,       // column refs, literals, function calls, parenthesized forms
} as const;

// Operators PostgreSQL declares %nonassoc: `a = b = c` is a syntax error, so an
// operand at the same level always needs parentheses, on either side.
const NONASSOC = new Set<number>([PREC.IS, PREC.COMPARISON, PREC.LIKE]);

function binaryOpPrec(op: string): number {
    switch (op.toUpperCase()) {
        case '=': case '<': case '>': case '<=': case '>=': case '<>': case '!=':
            return PREC.COMPARISON;
        case 'LIKE': case 'NOT LIKE': case 'ILIKE': case 'NOT ILIKE':
        case 'SIMILAR TO': case 'NOT SIMILAR TO':
            return PREC.LIKE;
        case 'IS DISTINCT FROM': case 'IS NOT DISTINCT FROM':
            return PREC.IS;
        case '+': case '-': return PREC.ADD;
        case '*': case '/': case '%': return PREC.MUL;
        case '^': return PREC.EXP;
        default: return PREC.OTHER;
    }
}

function precedence(node: SqlNode): number {
    switch (node.type) {
        case 'BoolExpr': {
            const op = propStr(node, 'op') ?? 'AND';
            return op === 'OR' ? PREC.OR : op === 'NOT' ? PREC.NOT : PREC.AND;
        }
        case 'NullTest':
        case 'BooleanTest':
            return PREC.IS;
        case 'BinaryExpr':
            return prop(node, 'left') ? binaryOpPrec(propStr(node, 'op') ?? '') : PREC.UNARY;
        case 'InExpr':
        case 'BetweenExpr':
            return PREC.LIKE;
        case 'QuantifiedExpr':
            return binaryOpPrec(propStr(node, 'op') ?? '=');
        case 'SubLink': {
            const type = propStr(node, 'type') ?? 'SCALAR';
            if (type !== 'ANY' && type !== 'ALL') return PREC.ATOM;
            const op = propStr(node, 'op') ?? '=';
            // `= ANY (subquery)` prints as IN
            return type === 'ANY' && op === '=' ? PREC.LIKE : binaryOpPrec(op);
        }
        case 'Cast':
            return PREC.CAST;
        case 'Literal':
            // A negative numeric constant reads as unary minus: `(-1)::int`, not `-1::int`
            return node.text?.startsWith('-') ? PREC.UNARY : PREC.ATOM;
        case 'FunctionCall':
            return propStr(node, 'name') === 'pg_catalog.timezone' ? PREC.AT : PREC.ATOM;
        default:
            return PREC.ATOM;
    }
}

/**
 * Print `child` as an operand that must bind at least as tightly as `minPrec`,
 * wrapping it in parentheses otherwise. A wrapped AND/OR goes on its own
 * indented lines, matching how boolean clauses print elsewhere.
 */
export function printOperand(child: SqlNode, minPrec: number, printNode: PrintFn): Doc {
    const doc = printNode(child);
    if (precedence(child) >= minPrec) return doc;
    if (child.type === 'BoolExpr' && propStr(child, 'op') !== 'NOT') {
        return ['(', indent([hardline, doc]), hardline, ')'];
    }
    return ['(', doc, ')'];
}

/** Minimum operand precedences for a binary operator at level `prec`. */
function operandPrecs(prec: number): { left: number; right: number } {
    // Left-associative: `a - b - c` is `(a - b) - c`, so only the right side
    // needs parentheses at the same level.
    return NONASSOC.has(prec) ? { left: prec + 1, right: prec + 1 } : { left: prec, right: prec + 1 };
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

const CONCAT_OPS = new Set(['+', '||']);

// Flatten a left-recursive chain of the same concatenation operator into its
// terms, parenthesizing any term that binds more loosely than the operator.
function collectConcatChain(node: SqlNode, op: string, printNode: PrintFn): Doc[] {
    const { left: leftPrec, right: rightPrec } = operandPrecs(binaryOpPrec(op));
    const left  = prop(node, 'left');
    const right = prop(node, 'right');
    const leftTerms: Doc[] = !left ? []
        : left.type === 'BinaryExpr' && propStr(left, 'op') === op && prop(left, 'left')
            ? collectConcatChain(left, op, printNode)
            : [printOperand(left, leftPrec, printNode)];
    return [...leftTerms, ...(right ? [printOperand(right, rightPrec, printNode)] : [])];
}

function printBinaryExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const left  = prop(node, 'left');
    const right = prop(node, 'right');
    const op    = propStr(node, 'op') ?? '?';

    // Unary prefix operator: -x, +x. A nested unary or negative literal gets
    // parentheses so `-(-x)` never prints as `--x`, which is a comment.
    if (!left) {
        return [op, right ? printOperand(right, PREC.UNARY + 1, printNode) : ''];
    }

    // For + / || chains: flatten and fill with indented continuation lines.
    // Flat: "a || b || c". Wrapping: "a || b\n    || c || d".
    if (CONCAT_OPS.has(op)) {
        const opStr = op === '||' ? '|| ' : '+ ';
        const terms = collectConcatChain(node, op, printNode);
        const parts: Doc[] = [terms[0]!];
        for (let i = 1; i < terms.length; i++) {
            parts.push(indent([line, opStr]));
            parts.push(terms[i]!);
        }
        return fill(parts);
    }

    const opDoc: Doc = /^[A-Z]/.test(op) ? keyword(op, opts) : op;
    const { left: leftPrec, right: rightPrec } = operandPrecs(binaryOpPrec(op));
    // LIKE / ILIKE / SIMILAR TO ... ESCAPE e
    const escape = prop(node, 'escape');
    const escapeDoc: Doc = escape ? [' ', keyword('ESCAPE', opts), ' ', printOperand(escape, rightPrec, printNode)] : '';
    return [printOperand(left, leftPrec, printNode), ' ', opDoc, ' ', right ? printOperand(right, rightPrec, printNode) : '', escapeDoc];
}

function printBoolExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const op = propStr(node, 'op') ?? 'AND';
    const args = propArr(node, 'args');

    if (op === 'NOT') {
        const arg = args[0];
        return [makeKeyword('NOT'), ' ', arg ? printOperand(arg, PREC.NOT, printNode) : ''];
    }

    // AND/OR are associative, so an operand only needs parentheses when it
    // binds more loosely: an OR inside an AND.
    const prec = op === 'OR' ? PREC.OR : PREC.AND;
    return join([hardline, makeKeyword(op), ' '], args.map((a) => printOperand(a, prec, printNode)));
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

    // ORDER BY inside the aggregate call: array_agg(x ORDER BY x) — or, for an
    // ordered-set aggregate, after it: percentile_cont(0.5) WITHIN GROUP (ORDER BY x)
    const orderByDoc: Doc = aggOrder.length > 0 ? [makeKeyword('ORDER BY'), ' ', join(', ', aggOrder.map(printNode))] : '';
    const withinGroup = propBool(node, 'withinGroup');
    let innerDoc: Doc = [distinctPrefix, join(', ', argDocs)];
    if (aggOrder.length > 0 && !withinGroup) innerDoc = [innerDoc, ' ', orderByDoc];

    let callDoc: Doc = [makeKeyword(name), '(', innerDoc, ')'];
    if (withinGroup) callDoc = [callDoc, ' ', makeKeyword('WITHIN GROUP'), ' (', orderByDoc, ')'];

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
        return [makeKeyword('SUBSTRING'), '(', printNode(str), ' ', makeKeyword('FROM'), ' ', printNode(fromExpr!), ' ', makeKeyword('FOR'), ' ', printNode(forExpr), ')'];
    }
    return [makeKeyword('SUBSTRING'), '(', printNode(str), ' ', makeKeyword('FROM'), ' ', printNode(fromExpr ?? args[1]!), ')'];
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
    return [makeKeyword('TRIM'), '(', makeKeyword(direction), ' ', printNode(chars), ' ', makeKeyword('FROM'), ' ', printNode(str!), ')'];
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
    const { left: leftPrec, right: rightPrec } = operandPrecs(PREC.AT);
    return [
        ts ? printOperand(ts, leftPrec, printNode) : '', ' ', makeKeyword('AT TIME ZONE'), ' ',
        tz ? printOperand(tz, rightPrec, printNode) : '',
    ];
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

    const refname     = propStr(node, 'refname');
    const frameExclude = propStr(node, 'frameExclude');

    const parts: Doc[] = [];

    // w2 AS (w ORDER BY b): inherits w's PARTITION BY (and ORDER BY)
    if (refname) parts.push(refname);
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
        if (frameExclude) parts.push(makeKeyword(frameExclude));
    }

    return join(' ', parts);
}

function printCast(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const arg = prop(node, 'arg');
    const typeName = propStr(node, 'typeName') ?? '';
    return [arg ? printOperand(arg, PREC.CAST, printNode) : '', '::', keyword(typeName, opts)];
}

function printSubLink(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const type     = propStr(node, 'type') ?? 'SCALAR';
    const subquery = prop(node, 'subquery');
    const testexpr = prop(node, 'testexpr');
    const op       = propStr(node, 'op') ?? '=';
    const inner    = subquery ? printNode(subquery) : '';
    const subDoc: Doc = ['(', indent([hardline, inner]), hardline, ')'];

    if (type === 'EXISTS') {
        const density = getDensity(opts);
        if (density === 'spacious') {
            return [makeKeyword('EXISTS'), ' ', subDoc];
        }
        // compact + standard: render inner query in compact mode so simple
        // subqueries stay inline; complex ones wrap when they exceed printWidth.
        const compactOpts = { ...opts, sqlDensity: 'compact' } as Options;
        const compactPrintFn: PrintFn = (n) =>
            n.type.endsWith('Statement')
                ? printQueryExpr(n, compactOpts)
                : printExpression(n, compactOpts, compactPrintFn);
        const compactInner = subquery ? compactPrintFn(subquery) : '';
        return group([
            makeKeyword('EXISTS'),
            ' (',
            indent([softline, compactInner]),
            softline,
            ')',
        ]);
    }

    const lhs: Doc = testexpr ? [printOperand(testexpr, precedence(node) + 1, printNode), ' '] : '';
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
    return [arg ? printOperand(arg, PREC.IS + 1, printNode) : '', ' ', isNull ? makeKeyword('IS NULL') : makeKeyword('IS NOT NULL')];
}

function printBooleanTest(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const test = propStr(node, 'test') ?? '';
    return [arg ? printOperand(arg, PREC.IS + 1, printNode) : '', ' ', makeKeyword('IS'), ' ', makeKeyword(test.replace(/_/g, ' '))];
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
    return [onlyPrefix(node, opts), rangeVarName(node), tableAliasDoc(node, opts)];
}

/** ` AS alias` plus the alias's column list when present: ` AS x(a, b)`. */
function tableAliasDoc(node: SqlNode, opts: Options): Doc {
    const columns = propStrArr(node, 'aliasColumns');
    return [aliasDoc(propStr(node, 'alias'), opts), columns.length > 0 ? ['(', join(', ', columns), ')'] : ''];
}

function printJoinExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (kw: string) => keyword(kw, opts);
    const joinType = propStr(node, 'joinType') ?? 'INNER';
    const lhs     = prop(node, 'lhs');
    const rhs     = prop(node, 'rhs');
    const on      = prop(node, 'on');
    const using   = propStrArr(node, 'using');

    const usingAlias = propStr(node, 'usingAlias');

    const joinKw: Doc =
        joinType === 'CROSS'   ? makeKeyword('CROSS JOIN')
        : joinType === 'INNER'   ? makeKeyword('JOIN')
        : [makeKeyword(joinType), ' ', makeKeyword('JOIN')];

    const condition: Doc = joinType === 'CROSS' ? ''
        : on      ? [' ', makeKeyword('ON'), ' ', printNode(on)]
        : using.length > 0 ? [' ', makeKeyword('USING'), ' (', join(', ', using), ')', aliasDoc(usingAlias, opts)]
        : '';

    // A join on the right-hand side must keep its parentheses: in
    // `a JOIN (b JOIN c ON x) ON y` they decide which ON belongs to which join
    const parenthesized = (doc: Doc): Doc => ['(', indent([hardline, doc]), hardline, ')'];
    const rhsDoc: Doc = !rhs ? '' : rhs.type === 'JoinExpr' && !propStr(rhs, 'alias') ? parenthesized(printNode(rhs)) : printNode(rhs);
    const joinDoc: Doc = [lhs ? printNode(lhs) : '', hardline, joinKw, ' ', rhsDoc, condition];

    // (a JOIN b ...) AS j: an alias on the whole join needs the parentheses
    return propStr(node, 'alias') ? [parenthesized(joinDoc), tableAliasDoc(node, opts)] : joinDoc;
}

function printSubquery(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword      = (kw: string) => keyword(kw, opts);
    const subquery = prop(node, 'subquery');
    const lateral  = propBool(node, 'lateral');
    const prefix: Doc = lateral ? [makeKeyword('LATERAL'), ' '] : '';
    return [prefix, '(', indent([hardline, subquery ? printNode(subquery) : '']), hardline, ')', tableAliasDoc(node, opts)];
}

// A function in FROM:
//   [LATERAL] f(x) [WITH ORDINALITY] [AS alias[(cols)] | AS [alias](col type, …)]
//   [LATERAL] ROWS FROM (f(x) [AS (col type, …)], …) [WITH ORDINALITY] [AS alias[(cols)]]
function printRangeFunction(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const columnDefsDoc = (defs: SqlNode[]): Doc => ['(', join(', ', defs.map(printNode)), ')'];
    const items = propArr(node, 'functions').map((f): Doc => {
        const call = prop(f, 'call');
        const defs = propArr(f, 'columnDefs');
        return [call ? printNode(call) : '', defs.length > 0 ? [' ', makeKeyword('AS'), ' ', columnDefsDoc(defs)] : ''];
    });
    const body: Doc = propBool(node, 'rowsFrom') ? [makeKeyword('ROWS FROM'), ' (', join(', ', items), ')'] : join(', ', items);
    const lateral: Doc = propBool(node, 'lateral') ? [makeKeyword('LATERAL'), ' '] : '';
    const ordinality: Doc = propBool(node, 'ordinality') ? [' ', makeKeyword('WITH ORDINALITY')] : '';

    // A column definition list takes the place of the alias column list
    const alias = propStr(node, 'alias');
    const defs = propArr(node, 'columnDefs');
    const aliasPart: Doc = defs.length > 0
        ? [' ', makeKeyword('AS'), alias ? [' ', alias] : ' ', columnDefsDoc(defs)]
        : tableAliasDoc(node, opts);
    return [lateral, body, ordinality, aliasPart];
}

// ---------------------------------------------------------------------------
// Sort / ORDER BY
// ---------------------------------------------------------------------------

function printSortItem(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const expr = prop(node, 'expr');
    const direction = propStr(node, 'direction');
    const nulls = propStr(node, 'nulls');
    return [expr ? printNode(expr) : '', direction ? [' ', makeKeyword(direction)] : '', nulls ? [' ', makeKeyword(nulls)] : ''];
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
    const fkAttrs = propStrArr(node, 'fkAttrs');
    const pkAttrs = propStrArr(node, 'pkAttrs');
    const keys    = propStrArr(node, 'keys');
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
    const missingOk = propBool(node, 'ifExists');
    const ifExists: Doc = missingOk ? [makeKeyword('IF EXISTS'), ' '] : '';
    const cascade: Doc = propBool(node, 'cascade') ? [' ', makeKeyword('CASCADE')] : '';

    switch (subtype) {
        case 'ADD COLUMN': {
            // For ADD COLUMN the same missing_ok flag means IF NOT EXISTS
            const ifNotExists: Doc = missingOk ? [makeKeyword('IF NOT EXISTS'), ' '] : '';
            return [makeKeyword('ADD COLUMN'), ' ', ifNotExists, def ? printNode(def) : name];
        }
        case 'DROP COLUMN':
            return [makeKeyword('DROP COLUMN'), ' ', ifExists, name, cascade];
        case 'DROP CONSTRAINT':
            return [makeKeyword('DROP CONSTRAINT'), ' ', ifExists, name, cascade];
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

function printFunctionParam(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    const mode = propStr(node, 'mode');
    const defaultExpr = prop(node, 'default');
    const modePrefix = mode ? [makeKeyword(mode), ' '] : '';
    return [
        modePrefix, name ? [name, ' '] : '', makeKeyword(typeName),
        defaultExpr ? [' ', makeKeyword('DEFAULT'), ' ', printNode(defaultExpr)] : '',
    ];
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
    const columns = propStrArr(node, 'columns');
    const query = prop(node, 'query');
    return [
        name, columns.length > 0 ? ['(', join(', ', columns), ')'] : '',
        ' ', makeKeyword('AS'), ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')',
    ];
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
    return [left ? printOperand(left, PREC.LIKE + 1, printNode) : '', ' ', keywordDoc, ' (', join(', ', items), ')'];
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
        arg  ? printOperand(arg,  PREC.LIKE + 1, printNode) : '',
        ' ', keywordDoc, ' ',
        low  ? printOperand(low,  PREC.LIKE + 1, printNode) : '',
        ' ', makeKeyword('AND'), ' ',
        high ? printOperand(high, PREC.LIKE + 1, printNode) : '',
    ];
}

function printQuantifiedExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword         = (kw: string) => keyword(kw, opts);
    const left       = prop(node, 'left');
    const right      = prop(node, 'right');
    const op         = propStr(node, 'op') ?? '=';
    const quantifier = propStr(node, 'quantifier') ?? 'ANY';
    // right is typically an array literal or subquery
    const leftDoc = left ? printOperand(left, binaryOpPrec(op) + 1, printNode) : '';
    return [leftDoc, ' ', op, ' ', makeKeyword(quantifier), '(', right ? printNode(right) : '', ')'];
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
    const including = propStrArr(node, 'including');
    return [
        makeKeyword('LIKE'), ' ', rangeVarName(relation),
        ...including.map((opt) => [' ', makeKeyword('INCLUDING'), ' ', makeKeyword(opt)] as Doc),
    ];
}

function printSubscript(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    const arg = prop(node, 'arg');
    const subscripts = propArr(node, 'subscripts');
    // Only a plain column or parameter can take a subscript directly: `f(x)[1]`
    // is a syntax error, and `(t.col).field` must not print as `t.col.field`,
    // which names a different column.
    const bare = (arg?.type === 'ColumnRef' || arg?.type === 'ParamRef') && subscripts[0]?.type !== 'FieldAccess';
    const base: Doc = !arg ? '' : bare || arg.type === 'Subscript' ? printNode(arg) : ['(', printNode(arg), ')'];
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

// ---------------------------------------------------------------------------
// SQL/JSON constructors — PostgreSQL 16+
// ---------------------------------------------------------------------------

function printJsonReturning(returning: string | null | undefined, opts: Options): Doc {
    return returning ? [' ', keyword('RETURNING', opts), ' ', keyword(returning, opts)] : '';
}

function printJsonObjectConstructor(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const pairs = propArr(node, 'pairs');
    const absentOnNull = propBool(node, 'absentOnNull');
    const unique = propBool(node, 'unique');
    const returning = propStr(node, 'returning');

    const pairDocs = pairs.map((p): Doc => {
        const keyDoc = prop(p, 'key') ? printNode(prop(p, 'key')!) : '';
        const valDoc = prop(p, 'value') ? printNode(prop(p, 'value')!) : '';
        return [keyDoc, ': ', valDoc];
    });

    // ABSENT ON NULL / WITH UNIQUE KEYS / RETURNING are trailing clauses — no comma before them
    const trailing: Doc[] = [];
    if (absentOnNull) trailing.push([' ', keyword('ABSENT ON NULL', opts)]);
    if (unique) trailing.push([' ', keyword('WITH UNIQUE KEYS', opts)]);
    const returningDoc = printJsonReturning(returning, opts);
    if (returningDoc) trailing.push(returningDoc);

    return [keyword('json_object', opts), '(', join(', ', pairDocs), ...trailing, ')'];
}

function printJsonArrayConstructor(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const items = propArr(node, 'items');
    const absentOnNull = propBool(node, 'absentOnNull');
    const returning = propStr(node, 'returning');

    const itemDocs = items.map((n) => printNode(n));
    const trailing: Doc[] = [];
    if (absentOnNull) trailing.push([' ', keyword('ABSENT ON NULL', opts)]);
    const returningDoc = printJsonReturning(returning, opts);
    if (returningDoc) trailing.push(returningDoc);

    return [keyword('json_array', opts), '(', join(', ', itemDocs), ...trailing, ')'];
}

function printJsonObjectAgg(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const keyNode = prop(node, 'key');
    const valNode = prop(node, 'value');
    const absentOnNull = propBool(node, 'absentOnNull');
    const unique = propBool(node, 'unique');
    const returning = propStr(node, 'returning');

    const trailing: Doc[] = [];
    if (absentOnNull) trailing.push([' ', keyword('ABSENT ON NULL', opts)]);
    if (unique) trailing.push([' ', keyword('WITH UNIQUE KEYS', opts)]);
    const returningDoc = printJsonReturning(returning, opts);
    if (returningDoc) trailing.push(returningDoc);

    return [keyword('json_objectagg', opts), '(', keyNode ? printNode(keyNode) : '', ': ', valNode ? printNode(valNode) : '', ...trailing, ')'];
}

function printJsonArrayAgg(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const argNode = prop(node, 'arg');
    const absentOnNull = propBool(node, 'absentOnNull');
    const returning = propStr(node, 'returning');

    const trailing: Doc[] = [];
    if (absentOnNull) trailing.push([' ', keyword('ABSENT ON NULL', opts)]);
    const returningDoc = printJsonReturning(returning, opts);
    if (returningDoc) trailing.push(returningDoc);

    return [keyword('json_arrayagg', opts), '(', argNode ? printNode(argNode) : '', ...trailing, ')'];
}

// ---------------------------------------------------------------------------
// XMLTABLE / JSON_TABLE
// ---------------------------------------------------------------------------

function printXmlTable(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const rowExpr = prop(node, 'rowExpr');
    const docExpr = prop(node, 'docExpr');
    const columns = propArr(node, 'columns');
    const alias   = propStr(node, 'alias');

    const colDocs: Doc[] = columns.map((col, i) => {
        const comma: Doc = i < columns.length - 1 ? ',' : '';
        if (col.type === 'XmlTableOrdinalityCol') {
            return [propStr(col, 'name') ?? '', ' ', makeKeyword('FOR ORDINALITY'), comma];
        }
        // XmlTableCol
        const parts: Doc[] = [
            propStr(col, 'name') ?? '',
            ' ',
            makeKeyword(propStr(col, 'typeName') ?? ''),
        ];
        const path    = prop(col, 'path');
        const defExpr = prop(col, 'default');
        const notNull = propBool(col, 'notNull');
        if (path)    parts.push(' ', makeKeyword('PATH'), ' ', printNode(path));
        if (defExpr) parts.push(' ', makeKeyword('DEFAULT'), ' ', printNode(defExpr));
        if (notNull) parts.push(' ', makeKeyword('NOT NULL'));
        parts.push(comma);
        return parts;
    });

    const inner: Doc = indent([
        hardline, rowExpr ? printNode(rowExpr) : '',
        hardline, makeKeyword('PASSING'), ' ', docExpr ? printNode(docExpr) : '',
        hardline, makeKeyword('COLUMNS'),
        indent(colDocs.map((c) => [hardline, c])),
    ]);

    return [makeKeyword('XMLTABLE'), '(', inner, hardline, ')', aliasDoc(alias, opts)];
}

function printJsonTable(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const context  = prop(node, 'context');
    const path     = prop(node, 'path');
    const pathName = propStr(node, 'pathName');
    const columns  = propArr(node, 'columns');
    const onError  = propStr(node, 'onError');
    const alias    = propStr(node, 'alias');

    const colDocs = buildJsonTableColumnDocs(columns, opts, printNode);

    const inner: Doc = indent([
        hardline, context ? printNode(context) : '',
        ',',
        hardline, path ? printNode(path) : '',
        pathName ? [' ', makeKeyword('AS'), ' ', pathName] : '',
        hardline, makeKeyword('COLUMNS'), ' (',
        indent(colDocs.map((c) => [hardline, c])),
        hardline, ')',
        onError ? [hardline, makeKeyword('ON ERROR'), ' ', makeKeyword(onError)] : '',
    ]);

    return [makeKeyword('JSON_TABLE'), '(', inner, hardline, ')', aliasDoc(alias, opts)];
}

function buildJsonTableColumnDocs(columns: SqlNode[], opts: Options, printNode: PrintFn): Doc[] {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    return columns.map((col, i) => {
        const comma: Doc   = i < columns.length - 1 ? ',' : '';
        const coltype      = propStr(col, 'coltype') ?? 'REGULAR';
        const name         = propStr(col, 'name') ?? '';
        const typeName     = propStr(col, 'typeName') ?? '';
        const path         = prop(col, 'path');
        const onEmpty      = propStr(col, 'onEmpty');
        const onError      = propStr(col, 'onError');
        const nested       = propArr(col, 'columns');

        if (coltype === 'FOR_ORDINALITY') {
            return [name, ' ', makeKeyword('FOR ORDINALITY'), comma] as Doc;
        }

        if (coltype === 'NESTED') {
            const nestedDocs = buildJsonTableColumnDocs(nested, opts, printNode);
            return [
                makeKeyword('NESTED PATH'), ' ', path ? printNode(path) : '',
                ' ', makeKeyword('COLUMNS'), ' (',
                indent(nestedDocs.map((c) => [hardline, c])),
                hardline, ')', comma,
            ] as Doc;
        }

        const parts: Doc[] = [name, ' ', makeKeyword(typeName)];
        if (coltype === 'EXISTS') {
            parts.push(' ', makeKeyword('EXISTS PATH'), ' ', path ? printNode(path) : '');
        } else if (coltype === 'FORMATTED') {
            parts.push(' ', makeKeyword('FORMAT JSON PATH'), ' ', path ? printNode(path) : '');
        } else if (path) {
            parts.push(' ', makeKeyword('PATH'), ' ', printNode(path));
        }
        if (onEmpty) parts.push(' ', makeKeyword('ON EMPTY'), ' ', makeKeyword(onEmpty));
        if (onError) parts.push(' ', makeKeyword('ON ERROR'), ' ', makeKeyword(onError));
        parts.push(comma);
        return parts as Doc;
    });
}
