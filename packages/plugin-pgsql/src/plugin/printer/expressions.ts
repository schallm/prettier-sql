import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options, PrintFn } from '@prettier-sql/core/printer/utils';
import { keyword, join, indent, hardline, softline, group, fill, line, getDensity, aliasDoc, parenList, parenItems, bracketItems } from '@prettier-sql/core/printer/utils';
import { printStatement, printQueryExpr } from './statements.js';
import { prop, propArr, propStr, propBool, propStrArr, rangeVarName, onlyPrefix, printFdwOptions } from './helpers.js';

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
            const collation = propStr(node, 'collation');
            const opclass = propStr(node, 'opclass');
            const nulls = propStr(node, 'nulls');
            // An expression other than a bare function call needs its own parentheses
            const base = expr ? (expr.type === 'FunctionCall' ? printNode(expr) : ['(', printNode(expr), ')']) : (name ?? '');
            return [
                base,
                collation ? [' ', keyword('COLLATE', opts), ' ', collation] : '',
                opclass ? [' ', opclass] : '',
                direction ? [' ', keyword(direction, opts)] : '',
                nulls ? [' ', keyword(nulls, opts)] : '',
            ];
        }
        case 'ExprList': return join(', ', propArr(node, 'items').map(printNode));
        case 'ArrayExpr': return printArrayExpr(node, opts, printNode);
        case 'Coalesce': return printCoalesce(node, opts, printNode);
        case 'RowExpr': return [propBool(node, 'explicit') ? keyword('ROW', opts) : '', '(', join(', ', propArr(node, 'args').map(printNode)), ')'];
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
        case 'SetToDefault':     return keyword('DEFAULT', opts);
        case 'Collate': {
            const arg = prop(node, 'arg');
            return [arg ? printOperand(arg, PREC.AT, printNode) : '', ' ', keyword('COLLATE', opts), ' ', propStr(node, 'collation') ?? ''];
        }
        case 'CurrentOf':        return [keyword('CURRENT OF', opts), ' ', propStr(node, 'cursor') ?? ''];
        case 'IntervalLiteral':  return printIntervalLiteral(node, opts, printNode);
        // value FORMAT JSON — a JSON constructor argument that is already JSON text
        case 'JsonFormatted': {
            const expr = prop(node, 'expr');
            return [expr ? printNode(expr) : '', ' ', keyword(propStr(node, 'format') ?? 'FORMAT JSON', opts)];
        }
        case 'RangeTableSample': return printRangeTableSample(node, opts, printNode);
        case 'TableLikeClause':  return printTableLikeClause(node, opts);
        case 'XmlExpr':          return printXmlExpr(node, opts, printNode);
        case 'XmlSerialize':     return printXmlSerialize(node, opts, printNode);
        case 'JsonFuncExpr':          return printJsonFuncExpr(node, opts, printNode);
        case 'XmlTable':              return printXmlTable(node, opts, printNode);
        case 'JsonTable':             return printJsonTable(node, opts, printNode);
        // SQL/JSON constructors — PostgreSQL 16+
        case 'JsonObjectConstructor': return printJsonObjectConstructor(node, opts, printNode);
        case 'JsonArrayConstructor':  return printJsonArrayConstructor(node, opts, printNode);
        case 'JsonObjectAgg':         return printJsonObjectAgg(node, opts, printNode);
        case 'JsonArrayAgg':          return printJsonArrayAgg(node, opts, printNode);
        case 'JsonIsPredicate':       return printJsonIsPredicate(node, false, opts, printNode);
        case 'JsonScalarExpr':        return printJsonUnaryCall('json_scalar', node, opts, printNode);
        case 'JsonSerializeExpr':     return printJsonUnaryCall('json_serialize', node, opts, printNode);
        case 'JsonParseExpr':         return printJsonUnaryCall('json', node, opts, printNode);
        case 'JsonArrayQueryConstructor': return printJsonArrayQuery(node, opts, printNode);
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
        case 'JsonIsPredicate':
            return PREC.IS;
        case 'XmlExpr':
            return propStr(node, 'op') === 'IS DOCUMENT' ? PREC.IS : PREC.ATOM;
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
        case 'Collate':
            return PREC.AT;
        case 'Literal':
            // A negative numeric constant reads as unary minus: `(-1)::int`, not `-1::int`
            return node.text?.startsWith('-') ? PREC.UNARY : PREC.ATOM;
        case 'FunctionCall':
            if (propStr(node, 'name') === 'pg_catalog.timezone') return PREC.AT;
            // (a, b) OVERLAPS (c, d), x IS NORMALIZED: written as operators in SQL
            if (propBool(node, 'sqlSyntax') && ['pg_catalog.overlaps', 'pg_catalog.is_normalized'].includes(propStr(node, 'name') ?? '')) return PREC.IS;
            return PREC.ATOM;
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

function isNormalizedCall(node: SqlNode): boolean {
    const n = propArr(node, 'args').length;
    return node.type === 'FunctionCall' && propBool(node, 'sqlSyntax') && propStr(node, 'name') === 'pg_catalog.is_normalized'
        && !prop(node, 'over') && !prop(node, 'filter') && (n === 1 || (n === 2 && normalForm(propArr(node, 'args')[1]) !== null));
}

function printBoolExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const op = propStr(node, 'op') ?? 'AND';
    const args = propArr(node, 'args');

    if (op === 'NOT') {
        const arg = args[0];
        // NOT is_normalized(x): x IS NOT NORMALIZED (the same tree)
        if (arg?.type === 'JsonIsPredicate') return printJsonIsPredicate(arg, true, opts, printNode);
        if (arg && isNormalizedCall(arg)) return printIsNormalizedForm(propArr(arg, 'args'), true, opts, printNode);
        return [makeKeyword('NOT'), ' ', arg ? printOperand(arg, PREC.NOT, printNode) : ''];
    }

    // AND/OR are associative, so an operand only needs parentheses when it
    // binds more loosely: an OR inside an AND.
    // Outside a WHERE/HAVING/ON-style clause (see `printBoolFlat`) the operands stay on
    // one line when they fit, and otherwise hang indented under the first.
    const prec = op === 'OR' ? PREC.OR : PREC.AND;
    const [first, ...rest] = args.map((a) => boolOperand(a, prec, printNode));
    return group([first ?? '', indent(rest.map((a) => [line, makeKeyword(op), ' ', a]))]);
}

/** An operand of AND/OR; a looser-binding AND/OR inside it gets parentheses that break only when too long. */
function boolOperand(a: SqlNode, prec: number, printNode: PrintFn): Doc {
    if (precedence(a) >= prec || a.type !== 'BoolExpr' || propStr(a, 'op') === 'NOT') return printOperand(a, prec, printNode);
    return group(['(', indent([softline, printNode(a)]), softline, ')']);
}

/**
 * An AND/OR chain with each operand on its own line, for a clause that supplies the
 * indent itself (WHERE, HAVING, JOIN ... ON, ON CONFLICT ... WHERE).
 */
export function printBoolFlat(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const op = propStr(node, 'op') ?? 'AND';
    if (node.type !== 'BoolExpr' || op === 'NOT') return printNode(node);
    const prec = op === 'OR' ? PREC.OR : PREC.AND;
    return join([hardline, keyword(op, opts), ' '], propArr(node, 'args').map((a) => boolOperand(a, prec, printNode)));
}

function printFunctionCall(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword       = (kw: string) => keyword(kw, opts);
    const rawName  = propStr(node, 'name') ?? '';
    const args     = propArr(node, 'args');
    const star     = propBool(node, 'star');
    const distinct = propBool(node, 'distinct');
    const aggOrder = propArr(node, 'aggOrder');

    // SQL standard keyword-form functions — reconstruct readable syntax
    if (propBool(node, 'sqlSyntax') && rawName.startsWith('pg_catalog.')) {
        const local = rawName.slice('pg_catalog.'.length).replace(/^"(.*)"$/, '$1');
        switch (local) {
            case 'overlaps':  if (args.length === 4) return printOverlapsForm(args, opts, printNode); break;
            case 'is_normalized': if (args.length >= 1 && args.length <= 2) return printIsNormalizedForm(args, false, opts, printNode); break;
            case 'normalize': return printNormalizeForm(args, opts, printNode);
            case 'system_user': if (args.length === 0) return makeKeyword('SYSTEM_USER'); break;
            case 'pg_collation_for': if (args.length === 1) return [makeKeyword('COLLATION FOR'), ' (', printNode(args[0]!), ')']; break;
            case 'xmlexists': if (args.length === 2) return [makeKeyword('XMLEXISTS'), '(', printNode(args[0]!), ' ', makeKeyword('PASSING'), ' ', printNode(args[1]!), ')']; break;
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

    // SQL syntax without a keyword form above maps to a pg_catalog function; print that
    // bare. A pg_catalog. prefix the user wrote stays: it bypasses the search path.
    const name = propBool(node, 'sqlSyntax') && rawName.startsWith('pg_catalog.')
        ? rawName.slice('pg_catalog.'.length)
        : rawName;

    const variadic = propBool(node, 'variadic');
    const argDocs: Doc[] = star ? [makeKeyword('*')]
        : args.map((a, i) => (variadic && i === args.length - 1 ? [makeKeyword('VARIADIC'), ' ', printNode(a)] : printNode(a)));
    const distinctPrefix: Doc = distinct ? [makeKeyword('DISTINCT'), ' '] : '';

    // ORDER BY inside the aggregate call: array_agg(x ORDER BY x) — or, for an
    // ordered-set aggregate, after it: percentile_cont(0.5) WITHIN GROUP (ORDER BY x)
    const orderByDoc: Doc = aggOrder.length > 0 ? [makeKeyword('ORDER BY'), ' ', join(', ', aggOrder.map(printNode))] : '';
    const withinGroup = propBool(node, 'withinGroup');
    const itemDocs: Doc[] = [...argDocs];
    if (itemDocs.length > 0) itemDocs[0] = [distinctPrefix, itemDocs[0]!];
    if (aggOrder.length > 0 && !withinGroup && itemDocs.length > 0) {
        itemDocs[itemDocs.length - 1] = [itemDocs[itemDocs.length - 1]!, ' ', orderByDoc];
    }

    let callDoc: Doc = [makeKeyword(name), parenItems(itemDocs, opts)];
    if (withinGroup) callDoc = [callDoc, ' ', makeKeyword('WITHIN GROUP'), ' (', orderByDoc, ')'];

    return printAggregateTail(callDoc, node, opts, printNode);
}

/** An aggregate call followed by its FILTER (WHERE ...) and OVER (...) clauses. */
function printAggregateTail(callDoc: Doc, node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const filter = prop(node, 'filter');
    const over = prop(node, 'over');
    // FILTER (WHERE ...) after the call, before OVER
    if (filter) {
        callDoc = [callDoc, ' ', makeKeyword('FILTER'), ' (', makeKeyword('WHERE'), ' ', printNode(filter), ')'];
    }

    if (!over) return callDoc;
    // Named window reference: OVER w (no inline spec)
    if (over.type === 'WindowRef') return [callDoc, ' ', makeKeyword('OVER'), ' ', over.text ?? ''];
    return [callDoc, ' ', makeKeyword('OVER'), ' (', printWindowDef(over, opts, printNode), ')'];
}

// (a, b) OVERLAPS (c, d) — the four arguments are the two rows' elements
function printOverlapsForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const row = (a: SqlNode, b: SqlNode): Doc => ['(', printNode(a), ', ', printNode(b), ')'];
    return [row(args[0]!, args[1]!), ' ', keyword('OVERLAPS', opts), ' ', row(args[2]!, args[3]!)];
}

/** The `NFC` of a normalization-form argument, which the grammar turns into a string constant. */
function normalForm(arg: SqlNode | undefined): string | null {
    const m = arg?.type === 'Literal' ? /^'(NFC|NFD|NFKC|NFKD)'$/.exec(arg.text ?? '') : null;
    return m ? m[1]! : null;
}

// x IS [NOT] [NFC | NFD | NFKC | NFKD] NORMALIZED
function printIsNormalizedForm(args: SqlNode[], negated: boolean, opts: Options, printNode: PrintFn): Doc {
    const form = args.length === 2 ? normalForm(args[1]) : null;
    return [
        printOperand(args[0]!, PREC.IS + 1, printNode), ' ', keyword('IS', opts), negated ? [' ', keyword('NOT', opts)] : '',
        form ? [' ', keyword(form, opts)] : '', ' ', keyword('NORMALIZED', opts),
    ];
}

// NORMALIZE(x [, NFC | NFD | NFKC | NFKD])
function printNormalizeForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const form = args.length === 2 ? normalForm(args[1]) : null;
    if (args.length === 0 || args.length > 2 || (args.length === 2 && !form)) {
        throw new Error('Unsupported NORMALIZE form');
    }
    return [keyword('NORMALIZE', opts), '(', printNode(args[0]!), form ? [', ', keyword(form, opts)] : '', ')'];
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
        // 1-arg: trim spaces. TRIM(x) trims both ends; ltrim(x) would be a plain
        // function call, not this syntax, so keep LEADING/TRAILING in keyword form.
        return direction === 'BOTH'
            ? [makeKeyword('TRIM'), '(', str ? printNode(str) : '', ')']
            : [makeKeyword('TRIM'), '(', makeKeyword(direction), ' ', makeKeyword('FROM'), ' ', str ? printNode(str) : '', ')'];
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
// ts AT LOCAL — pg_catalog.timezone(ts), a single-arg call with no zone
function printAtTimeZoneForm(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const { left: leftPrec, right: rightPrec } = operandPrecs(PREC.AT);
    if (args.length === 1) {
        const [ts] = args;
        return [ts ? printOperand(ts, leftPrec, printNode) : '', ' ', makeKeyword('AT LOCAL')];
    }
    const [tz, ts] = args;  // pg_catalog.timezone(zone, timestamp)
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
    const rawOp    = propStr(node, 'op');
    // OPERATOR(pg_catalog.=) takes the keyword case like any other keyword; a bare
    // symbol such as = or < is printed as is
    const op: Doc | null = rawOp?.startsWith('OPERATOR(') ? makeKeyword(rawOp) : rawOp;
    const inner    = subquery ? printNode(subquery) : '';
    const subDoc: Doc = ['(', indent([hardline, inner]), hardline, ')'];

    if (type === 'EXISTS') {
        const density = getDensity(opts);
        // standard + spacious: the subquery goes on its own lines, formatted like any other SELECT
        if (density !== 'compact') {
            return [makeKeyword('EXISTS'), ' ', subDoc];
        }
        // compact: render inner query in compact mode so simple
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
        // IN (subquery) parses as an ANY sublink with no operator; = ANY names it
        return op ? [lhs, op, ' ', makeKeyword('ANY'), ' ', subDoc] : [lhs, makeKeyword('IN'), ' ', subDoc];
    }
    if (type === 'ALL') return [lhs, op ?? '=', ' ', makeKeyword('ALL'), ' ', subDoc];
    // (a, b) < (SELECT x, y): a row comparison with a single-row subquery
    if (type === 'ROWCOMPARE') return [lhs, op ?? '=', ' ', subDoc];
    if (type === 'ARRAY') return [makeKeyword('ARRAY'), subDoc];
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
        indent([
            hardline, join(hardline, whenDocs),
            else_ ? [hardline, makeKeyword('ELSE'), ' ', printNode(else_)] : '',
        ]),
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
export function tableAliasDoc(node: SqlNode, opts: Options): Doc {
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
    const body: Doc = propBool(node, 'rowsFrom') ? [makeKeyword('ROWS FROM'), ' ', parenItems(items, opts)] : join(', ', items);
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
    const collation = propStr(node, 'collation');
    const storage = propStr(node, 'storage');
    const compression = propStr(node, 'compression');
    // A column of a typed table (CREATE TABLE t OF type) has no type of its own
    const parts: Doc[] = [name, typeName ? [' ', makeKeyword(typeName)] : [' ', makeKeyword('WITH OPTIONS')],
        storage ? [' ', makeKeyword('STORAGE'), ' ', makeKeyword(storage)] : '',
        compression ? [' ', makeKeyword('COMPRESSION'), ' ', compression] : '',
        // OPTIONS (foreign table columns) come before the collation and constraints
        printFdwOptions(node, opts),
        collation ? [' ', makeKeyword('COLLATE'), ' ', collation] : ''];
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
    const keys = propStrArr(node, 'keys');
    const indexName = propStr(node, 'indexName');

    const namePrefix: Doc = name ? [makeKeyword('CONSTRAINT'), ' ', name, ' '] : '';
    const colList = (cols: string[]): Doc => (cols.length > 0 ? [' (', cols.join(', '), ')'] : '');

    // PRIMARY KEY / UNIQUE / EXCLUDE: INCLUDE (...) WITH (...) USING INDEX TABLESPACE ts
    const including = propStrArr(node, 'including');
    const indexOptions = propStrArr(node, 'indexOptions');
    const indexSpace = propStr(node, 'indexSpace');
    const indexParams: Doc = [
        including.length > 0 ? [' ', makeKeyword('INCLUDE'), colList(including)] : '',
        indexOptions.length > 0 ? [' ', makeKeyword('WITH'), ' (', indexOptions.join(', '), ')'] : '',
        indexSpace ? [' ', makeKeyword('USING INDEX TABLESPACE'), ' ', indexSpace] : '',
    ];
    // ADD PRIMARY KEY USING INDEX i takes the index in place of a column list
    const keyTarget: Doc = indexName ? [' ', makeKeyword('USING INDEX'), ' ', indexName] : [colList(keys), indexParams];

    // Constraint attributes: table-level constraints carry these as flags (column-level
    // ones arrive as separate DEFERRABLE / INITIALLY ... constraints)
    const attributes: Doc = [
        propBool(node, 'deferrable') ? [' ', makeKeyword('DEFERRABLE')] : '',
        propBool(node, 'initDeferred') ? [' ', makeKeyword('INITIALLY DEFERRED')] : '',
        propBool(node, 'notValid') ? [' ', makeKeyword('NOT VALID')] : '',
        propBool(node, 'noInherit') ? [' ', makeKeyword('NO INHERIT')] : '',
    ];

    switch (contype) {
        case 'NULL':     return [namePrefix, makeKeyword('NULL')];
        case 'NOT NULL': return [namePrefix, makeKeyword('NOT NULL'), attributes];

        case 'DEFAULT':
            return [namePrefix, makeKeyword('DEFAULT'), expr ? [' ', printNode(expr)] : ''];

        case 'CHECK':
            return [namePrefix, makeKeyword('CHECK'), ' (', expr ? printNode(expr) : '', ')', attributes];

        case 'PRIMARY KEY':
            return [namePrefix, makeKeyword('PRIMARY KEY'), keyTarget, attributes];

        case 'UNIQUE': {
            const nnd: Doc = propBool(node, 'nullsNotDistinct') ? [' ', makeKeyword('NULLS NOT DISTINCT')] : '';
            return [namePrefix, makeKeyword('UNIQUE'), nnd, keyTarget, attributes];
        }

        case 'EXCLUDE': {
            // EXCLUDE USING gist (room WITH =, during WITH &&) ... WHERE (pred)
            const elems = propArr(node, 'exclusions').map((e): Doc => {
                const elem = prop(e, 'elem');
                return [elem ? printNode(elem) : '', ' ', makeKeyword('WITH'), ' ', propStr(e, 'op') ?? ''];
            });
            const method = propStr(node, 'accessMethod');
            const where = prop(node, 'where');
            return [
                namePrefix, makeKeyword('EXCLUDE'),
                method ? [' ', makeKeyword('USING'), ' ', method] : '',
                ' ', parenList(elems), indexParams,
                where ? [' ', makeKeyword('WHERE'), ' (', printNode(where), ')'] : '',
                attributes,
            ];
        }

        case 'FOREIGN KEY': {
            // Column-level: REFERENCES table [(col, ...)] ...
            // Table-level:  FOREIGN KEY (fkAttrs) REFERENCES table [(pkAttrs)] ...
            const fkAttrs = propStrArr(node, 'fkAttrs');
            const pktable = prop(node, 'pktable');
            const fkMatch = propStr(node, 'fkMatch');
            const fkUpdAction = propStr(node, 'fkUpdAction');
            const fkDelAction = propStr(node, 'fkDelAction');
            const fkDelSetCols = propStrArr(node, 'fkDelSetCols');
            const references: Doc = [
                makeKeyword('REFERENCES'), ' ', pktable ? printRangeVar(pktable, opts) : '', colList(propStrArr(node, 'pkAttrs')),
                fkMatch ? [' ', makeKeyword('MATCH'), ' ', makeKeyword(fkMatch)] : '',
                fkUpdAction ? [' ', makeKeyword('ON UPDATE'), ' ', makeKeyword(fkUpdAction)] : '',
                fkDelAction ? [' ', makeKeyword('ON DELETE'), ' ', makeKeyword(fkDelAction), colList(fkDelSetCols)] : '',
            ];
            return fkAttrs.length > 0
                ? [namePrefix, makeKeyword('FOREIGN KEY'), colList(fkAttrs), ' ', references, attributes]
                : [namePrefix, references, attributes];
        }

        case 'IDENTITY': {
            const when = propStr(node, 'generatedWhen') ?? 'BY DEFAULT';
            const seqOptions = propStrArr(node, 'identityOptions');
            return [
                namePrefix, makeKeyword('GENERATED'), ' ', makeKeyword(when), ' ', makeKeyword('AS IDENTITY'),
                seqOptions.length > 0 ? [' (', join(' ', seqOptions.map((o) => keyword(o, opts))), ')'] : '',
            ];
        }

        case 'GENERATED':
            return [namePrefix, makeKeyword('GENERATED ALWAYS AS'), ' (', expr ? printNode(expr) : '', ') ', makeKeyword('STORED')];

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
    const value   = propStr(node, 'value');
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
        case 'ALTER COLUMN TYPE': {
            const using = prop(node, 'using');
            const collation = propStr(node, 'collation');
            return [
                makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('TYPE'), ' ', newType ? makeKeyword(newType) : '',
                collation ? [' ', makeKeyword('COLLATE'), ' ', collation] : '',
                using ? [' ', makeKeyword('USING'), ' ', printNode(using)] : '',
            ];
        }
        case 'SET DEFAULT':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET DEFAULT'), ' ', expr ? printNode(expr) : ''];
        case 'DROP DEFAULT':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP DEFAULT')];
        case 'SET NOT NULL':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET NOT NULL')];
        case 'DROP NOT NULL':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP NOT NULL')];
        case 'DROP EXPRESSION':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP EXPRESSION'), missingOk ? [' ', makeKeyword('IF EXISTS')] : ''];
        case 'ADD IDENTITY':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('ADD'), ' ', def ? printNode(def) : ''];
        case 'DROP IDENTITY':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('DROP IDENTITY'), missingOk ? [' ', makeKeyword('IF EXISTS')] : ''];
        case 'SET IDENTITY':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', join(' ', propStrArr(node, 'options').map((o) => makeKeyword(o)))];
        case 'SET STATISTICS':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET STATISTICS'), ' ', value !== null ? value : makeKeyword('DEFAULT')];
        case 'SET COLUMN OPTIONS':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET'), ' (', join(', ', propStrArr(node, 'options')), ')'];
        case 'RESET COLUMN OPTIONS':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('RESET'), ' (', join(', ', propStrArr(node, 'options')), ')'];
        case 'SET STORAGE':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET STORAGE'), ' ', makeKeyword(value ?? '')];
        case 'SET COMPRESSION':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET COMPRESSION'), ' ', value === 'default' ? makeKeyword('DEFAULT') : (value ?? '')];
        case 'SET EXPRESSION':
            return [makeKeyword('ALTER COLUMN'), ' ', name, ' ', makeKeyword('SET EXPRESSION AS'), ' (', expr ? printNode(expr) : '', ')'];
        case 'ALTER COLUMN OPTIONS':
            return [makeKeyword('ALTER COLUMN'), ' ', name, printAlterOptions(node, opts)];
        case 'OPTIONS':
            return [makeKeyword('OPTIONS'), ' (', join(', ', alterOptionDocs(node, opts)), ')'];
        case 'ALTER CONSTRAINT':
            return [
                makeKeyword('ALTER CONSTRAINT'), ' ', name, ' ',
                propBool(node, 'deferrable') ? makeKeyword('DEFERRABLE') : makeKeyword('NOT DEFERRABLE'),
                propBool(node, 'initDeferred') ? [' ', makeKeyword('INITIALLY DEFERRED')] : '',
            ];
        case 'SET REL OPTIONS':
            return [makeKeyword('SET'), ' (', join(', ', propStrArr(node, 'options')), ')'];
        case 'RESET REL OPTIONS':
            return [makeKeyword('RESET'), ' (', join(', ', propStrArr(node, 'options')), ')'];
        case 'INHERIT':
        case 'NO INHERIT': {
            const parent = prop(node, 'parent');
            return [makeKeyword(subtype), ' ', parent ? rangeVarName(parent) : ''];
        }
        case 'OF':
            return [makeKeyword('OF'), ' ', value ?? ''];
        case 'REPLICA IDENTITY':
            return [makeKeyword('REPLICA IDENTITY'), ' ', makeKeyword(value ?? ''), name ? [' ', name] : ''];
        case 'ATTACH PARTITION': {
            const parent = prop(node, 'parent');
            const bound = prop(node, 'bound');
            return [makeKeyword('ATTACH PARTITION'), ' ', parent ? rangeVarName(parent) : '', bound ? [' ', printPartitionBound(bound, opts)] : ''];
        }
        case 'DETACH PARTITION': {
            const parent = prop(node, 'parent');
            return [makeKeyword('DETACH PARTITION'), ' ', parent ? rangeVarName(parent) : '',
                propBool(node, 'concurrently') ? [' ', makeKeyword('CONCURRENTLY')] : '',
                propBool(node, 'finalize') ? [' ', makeKeyword('FINALIZE')] : ''];
        }
        // Everything else is a keyword phrase, optionally followed by the name it applies to
        default:
            return [makeKeyword(subtype), name ? [' ', name] : ''];
    }
}

/** The `ADD name 'value'` / `SET name 'value'` / `DROP name` entries of an ALTER ... OPTIONS list. */
function alterOptionDocs(node: SqlNode, opts: Options): Doc[] {
    return propArr(node, 'fdwOptions').map((o): Doc => {
        const action = propStr(o, 'action');
        const key = propStr(o, 'key') ?? '';
        const val = propStr(o, 'val');
        return [
            action ? [keyword(action, opts), ' '] : '',
            key,
            val !== null ? [" '", val.replace(/'/g, "''"), "'"] : '',
        ];
    });
}

function printAlterOptions(node: SqlNode, opts: Options): Doc {
    return [' ', keyword('OPTIONS', opts), ' (', join(', ', alterOptionDocs(node, opts)), ')'];
}

/** `FOR VALUES FROM (...) TO (...)`, `FOR VALUES IN (...)`, `FOR VALUES WITH (MODULUS m, REMAINDER r)` or `DEFAULT`. */
export function printPartitionBound(bound: SqlNode, opts: Options): Doc {
    const makeKeyword = (k: string) => keyword(k, opts);
    const printNode: PrintFn = (n) => printExpression(n, opts, printNode);
    const values = (name: string): Doc => join(', ', propArr(bound, name).map((n) => printNode(n)));
    const lower      = propArr(bound, 'lower');
    const upper      = propArr(bound, 'upper');
    const listDatums = propArr(bound, 'listDatums');
    const modulus    = bound.props?.['modulus']  as number | undefined;
    const remainder  = bound.props?.['remainder'] as number | undefined;

    if (propBool(bound, 'isDefault')) return makeKeyword('DEFAULT');
    if (lower.length > 0 || upper.length > 0) {
        return [makeKeyword('FOR VALUES FROM'), ' (', values('lower'), ') ', makeKeyword('TO'), ' (', values('upper'), ')'];
    }
    if (listDatums.length > 0) return [makeKeyword('FOR VALUES IN'), ' (', values('listDatums'), ')'];
    if (modulus !== undefined && remainder !== undefined) {
        return [makeKeyword('FOR VALUES WITH'), ' (', makeKeyword('MODULUS'), ' ', String(modulus), ', ', makeKeyword('REMAINDER'), ' ', String(remainder), ')'];
    }
    return '';
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
    const literals = elements.every((v) => v.type === 'Literal');
    return [makeKeyword('ARRAY'), bracketItems('[', ']', elements.map(printNode), opts, literals)];
}

function printCoalesce(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const args = propArr(node, 'args');
    return [makeKeyword('COALESCE'), parenItems(args.map(printNode), opts)];
}

function printCteInline(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const columns = propStrArr(node, 'columns');
    const materialized = propStr(node, 'materialized');
    const query = prop(node, 'query');
    return [
        name, columns.length > 0 ? ['(', join(', ', columns), ')'] : '',
        ' ', makeKeyword('AS'), materialized ? [' ', makeKeyword(materialized)] : '',
        ' (', indent([hardline, query ? printNode(query) : '']), hardline, ')',
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
    const literals = (values ? propArr(values, 'items') : []).every((v) => v.type === 'Literal');
    return [left ? printOperand(left, PREC.LIKE + 1, printNode) : '', ' ', keywordDoc, ' ', parenItems(items, opts, literals)];
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
    const clauses = propStrArr(node, 'clauses');
    return [
        makeKeyword('LIKE'), ' ', rangeVarName(relation),
        ...clauses.map((clause) => [' ', makeKeyword(clause)] as Doc),
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
    return [base, ...printIndirection(subscripts, printNode)];
}

/** The column of an INSERT column list or SET assignment: `a`, `a[1]`, `a.b`. */
export function printAssignTarget(t: SqlNode, printNode: PrintFn): Doc {
    return [propStr(t, 'name') ?? '', ...printIndirection(propArr(t, 'indirection'), printNode)];
}

/** One `col = value` entry of SET / DO UPDATE SET / WHEN MATCHED THEN UPDATE SET. */
export function printAssignment(t: SqlNode, printNode: PrintFn): Doc {
    if (t.type === 'MultiAssignment') {
        const source = prop(t, 'source');
        return ['(', join(', ', propArr(t, 'columns').map((c) => printAssignTarget(c, printNode))), ') = ', source ? printNode(source) : ''];
    }
    const val = prop(t, 'val');
    return [printAssignTarget(t, printNode), ' = ', val ? printNode(val) : ''];
}

/** `[1]`, `[1:2]` and `.field` suffixes of a subscripted expression or assignment target. */
export function printIndirection(subscripts: SqlNode[], printNode: PrintFn): Doc[] {
    return subscripts.map((s): Doc => {
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
    if (op === 'XMLPARSE') {
        const documentOrContent = propStr(node, 'documentOrContent') ?? 'DOCUMENT';
        const [content] = args;
        const preserveWhitespace = propBool(node, 'preserveWhitespace');
        return [
            makeKeyword('XMLPARSE'),
            '(',
            makeKeyword(documentOrContent),
            ' ',
            content ? printNode(content) : '',
            preserveWhitespace ? [' ', makeKeyword('PRESERVE WHITESPACE')] : '',
            ')',
        ];
    }
    if (op === 'XMLROOT') {
        return printXmlRoot(args, opts, printNode);
    }
    // expr IS DOCUMENT: a postfix predicate, not a function call
    if (op === 'IS DOCUMENT') {
        const [arg] = args;
        return [arg ? printOperand(arg, PREC.IS + 1, printNode) : '', ' ', makeKeyword('IS DOCUMENT')];
    }
    // XMLCONCAT — simple arg list
    const allArgs = [...namedArgs, ...args].map(printNode);
    return [makeKeyword(op), '(', join(', ', allArgs), ')'];
}

// XMLROOT(x, VERSION v|NO VALUE, STANDALONE YES|NO|NO VALUE)
// args: [data, version-or-null, standalone-code (0=YES,1=NO,2=NO VALUE,3=omitted)]
function printXmlRoot(args: SqlNode[], opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const [data, version, standalone] = args;
    const parts: Doc[] = [makeKeyword('XMLROOT'), '(', data ? printNode(data) : '', ', ', makeKeyword('VERSION'), ' '];
    const versionText = (version as any)?.text as string | undefined;
    parts.push(!version || versionText === 'null' ? makeKeyword('NO VALUE') : printNode(version));

    const standaloneCode = (standalone as any)?.text != null ? Number((standalone as any).text) : undefined;
    if (standaloneCode !== undefined && standaloneCode !== 3) {
        const standaloneKw = standaloneCode === 0 ? 'YES' : standaloneCode === 1 ? 'NO' : 'NO VALUE';
        parts.push(', ', makeKeyword('STANDALONE'), ' ', makeKeyword(standaloneKw));
    }
    parts.push(')');
    return parts;
}

// XMLSERIALIZE(DOCUMENT|CONTENT expr AS typeName [INDENT])
function printXmlSerialize(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const documentOrContent = propStr(node, 'documentOrContent') ?? 'DOCUMENT';
    const expr = prop(node, 'expr');
    const typeName = propStr(node, 'typeName');
    const indent = propBool(node, 'indent');
    return [
        makeKeyword('XMLSERIALIZE'), '(', makeKeyword(documentOrContent), ' ',
        expr ? printNode(expr) : '', ' ', makeKeyword('AS'), ' ', typeName ?? '',
        indent ? [' ', makeKeyword('INDENT')] : '',
        ')',
    ];
}

function printJsonFuncExpr(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword        = (kw: string) => keyword(kw, opts);
    const op        = propStr(node, 'op') ?? 'JSON_QUERY';
    const context   = prop(node, 'context');
    const path      = prop(node, 'path');
    const returning = propStr(node, 'returning');

    const contextFormat = propStr(node, 'contextFormat');
    const parts: Doc[] = [
        context ? printNode(context) : '',
        contextFormat ? [' ', makeKeyword(contextFormat)] : '',
        ', ',
        path ? printNode(path) : '',
        printJsonPassing(node, opts, printNode),
    ];
    if (returning) parts.push(' ', makeKeyword('RETURNING'), ' ', makeKeyword(returning));
    parts.push(printJsonQueryOptions(node, opts, printNode));
    return [makeKeyword(op), '(', ...parts, ')'];
}

/** PASSING value AS name, ... */
function printJsonPassing(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const args = propArr(node, 'passing');
    if (args.length === 0) return '';
    return [' ', keyword('PASSING', opts), ' ', join(', ', args.map((a): Doc => {
        const value = prop(a, 'value');
        return [value ? printNode(value) : '', ' ', keyword('AS', opts), ' ', propStr(a, 'name') ?? ''];
    }))];
}

/** WITH WRAPPER, KEEP QUOTES, <behavior> ON EMPTY, <behavior> ON ERROR — in the order SQL requires. */
function printJsonQueryOptions(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const wrapper = propStr(node, 'wrapper');
    const quotes = propStr(node, 'quotes');
    return [
        wrapper ? [' ', keyword(wrapper, opts)] : '',
        quotes ? [' ', keyword(quotes, opts)] : '',
        printJsonBehavior(prop(node, 'onEmpty'), 'ON EMPTY', opts, printNode),
        printJsonBehavior(prop(node, 'onError'), 'ON ERROR', opts, printNode),
    ];
}

function printJsonBehavior(b: SqlNode | null | undefined, on: string, opts: Options, printNode: PrintFn): Doc {
    if (!b) return '';
    const expr = prop(b, 'expr');
    return [' ', keyword(propStr(b, 'kind') ?? 'NULL', opts), expr ? [' ', printNode(expr)] : '', ' ', keyword(on, opts)];
}

// ---------------------------------------------------------------------------
// SQL/JSON constructors — PostgreSQL 16+
// ---------------------------------------------------------------------------

/**
 * The clauses that end a SQL/JSON constructor call, in the order SQL requires:
 * ORDER BY (arrayagg), ON NULL, WITH UNIQUE KEYS, RETURNING.
 */
function printJsonConstructorTail(node: SqlNode, opts: Options, printNode: PrintFn, hasArgs = true): Doc {
    const aggOrder = propArr(node, 'aggOrder');
    const onNull = propStr(node, 'onNull');
    const returning = propStr(node, 'returning');
    const parts: Doc[] = [];
    if (aggOrder.length > 0) parts.push([keyword('ORDER BY', opts), ' ', join(', ', aggOrder.map(printNode))]);
    if (onNull) parts.push(keyword(onNull, opts));
    if (propBool(node, 'unique')) parts.push(keyword('WITH UNIQUE KEYS', opts));
    if (returning) parts.push([keyword('RETURNING', opts), ' ', keyword(returning, opts)]);
    // json_object(returning jsonb): nothing before the clauses, so no space either
    return parts.length === 0 ? '' : [hasArgs ? ' ' : '', join(' ', parts)];
}

function printJsonObjectConstructor(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const pairDocs = propArr(node, 'pairs').map((p): Doc => {
        const keyDoc = prop(p, 'key') ? printNode(prop(p, 'key')!) : '';
        const valDoc = prop(p, 'value') ? printNode(prop(p, 'value')!) : '';
        return [keyDoc, ': ', valDoc];
    });
    return [keyword('json_object', opts), '(', join(', ', pairDocs), printJsonConstructorTail(node, opts, printNode, pairDocs.length > 0), ')'];
}

function printJsonArrayConstructor(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const itemDocs = propArr(node, 'items').map((n) => printNode(n));
    return [keyword('json_array', opts), '(', join(', ', itemDocs), printJsonConstructorTail(node, opts, printNode, itemDocs.length > 0), ')'];
}

// x [FORMAT JSON] IS [NOT] JSON [VALUE | ARRAY | OBJECT | SCALAR] [WITH UNIQUE KEYS]
function printJsonIsPredicate(node: SqlNode, negated: boolean, opts: Options, printNode: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const format = propStr(node, 'format');
    const itemType = propStr(node, 'itemType');
    return [
        expr ? printOperand(expr, PREC.IS + 1, printNode) : '',
        format ? [' ', keyword(format, opts)] : '',
        ' ', keyword('IS', opts), negated ? [' ', keyword('NOT', opts)] : '', ' ', keyword('JSON', opts),
        itemType ? [' ', keyword(itemType, opts)] : '',
        propBool(node, 'unique') ? [' ', keyword('WITH UNIQUE KEYS', opts)] : '',
    ];
}

// JSON_SCALAR(x), JSON_SERIALIZE(x [FORMAT JSON] [RETURNING t]), JSON(x [WITH UNIQUE KEYS])
function printJsonUnaryCall(name: string, node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const expr = prop(node, 'expr');
    return [keyword(name, opts), '(', expr ? printNode(expr) : '', printJsonConstructorTail(node, opts, printNode), ')'];
}

// JSON_ARRAY(SELECT ... [FORMAT JSON] [ABSENT ON NULL] [RETURNING t])
function printJsonArrayQuery(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const query = prop(node, 'query');
    const format = propStr(node, 'format');
    const returning = propStr(node, 'returning');
    const tail: Doc[] = [];
    if (format) tail.push(keyword(format, opts));
    if (returning) tail.push(keyword('RETURNING', opts), keyword(returning, opts));
    return [
        keyword('json_array', opts), '(',
        indent([hardline, query ? printNode(query) : '', tail.length > 0 ? [hardline, join(' ', tail)] : '']),
        hardline, ')',
    ];
}

function printJsonObjectAgg(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const keyNode = prop(node, 'key');
    const valNode = prop(node, 'value');
    const call: Doc = [
        keyword('json_objectagg', opts), '(', keyNode ? printNode(keyNode) : '', ': ', valNode ? printNode(valNode) : '',
        printJsonConstructorTail(node, opts, printNode), ')',
    ];
    return printAggregateTail(call, node, opts, printNode);
}

function printJsonArrayAgg(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const argNode = prop(node, 'arg');
    const call: Doc = [keyword('json_arrayagg', opts), '(', argNode ? printNode(argNode) : '', printJsonConstructorTail(node, opts, printNode), ')'];
    return printAggregateTail(call, node, opts, printNode);
}

// ---------------------------------------------------------------------------
// XMLTABLE / JSON_TABLE
// ---------------------------------------------------------------------------

function printXmlTable(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const rowExpr = prop(node, 'rowExpr');
    const docExpr = prop(node, 'docExpr');
    const columns = propArr(node, 'columns');

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

    const namespaces = propArr(node, 'namespaces');
    const inner: Doc = indent([
        namespaces.length > 0
            ? [hardline, makeKeyword('XMLNAMESPACES'), '(', join(', ', namespaces.map((ns): Doc => {
                const name = propStr(ns, 'name');
                const value = prop(ns, 'value');
                return name ? [value ? printNode(value) : '', ' ', makeKeyword('AS'), ' ', name] : [makeKeyword('DEFAULT'), ' ', value ? printNode(value) : ''];
            })), '),']
            : '',
        hardline, rowExpr ? printNode(rowExpr) : '',
        hardline, makeKeyword('PASSING'), ' ', docExpr ? printNode(docExpr) : '',
        hardline, makeKeyword('COLUMNS'),
        indent(colDocs.map((c) => [hardline, c])),
    ]);

    return [makeKeyword('XMLTABLE'), '(', inner, hardline, ')', tableAliasDoc(node, opts)];
}

function printJsonTable(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    const context  = prop(node, 'context');
    const path     = prop(node, 'path');
    const pathName = propStr(node, 'pathName');
    const columns  = propArr(node, 'columns');

    const colDocs = buildJsonTableColumnDocs(columns, opts, printNode);

    const inner: Doc = indent([
        hardline, context ? printNode(context) : '',
        ',',
        hardline, path ? printNode(path) : '',
        pathName ? [' ', makeKeyword('AS'), ' ', pathName] : '',
        printJsonPassing(node, opts, printNode),
        hardline, makeKeyword('COLUMNS'), ' (',
        indent(colDocs.map((c) => [hardline, c])),
        hardline, ')',
        printJsonBehavior(prop(node, 'onError'), 'ON ERROR', opts, printNode),
    ]);

    return [makeKeyword('JSON_TABLE'), '(', inner, hardline, ')', tableAliasDoc(node, opts)];
}

function buildJsonTableColumnDocs(columns: SqlNode[], opts: Options, printNode: PrintFn): Doc[] {
    const makeKeyword = (kw: string) => keyword(kw, opts);
    return columns.map((col, i) => {
        const comma: Doc   = i < columns.length - 1 ? ',' : '';
        const coltype      = propStr(col, 'coltype') ?? 'REGULAR';
        const name         = propStr(col, 'name') ?? '';
        const typeName     = propStr(col, 'typeName') ?? '';
        const path         = prop(col, 'path');
        const pathName     = propStr(col, 'pathName');
        const nested       = propArr(col, 'columns');

        if (coltype === 'FOR_ORDINALITY') {
            return [name, ' ', makeKeyword('FOR ORDINALITY'), comma] as Doc;
        }

        if (coltype === 'NESTED') {
            const nestedDocs = buildJsonTableColumnDocs(nested, opts, printNode);
            return [
                makeKeyword('NESTED PATH'), ' ', path ? printNode(path) : '',
                pathName ? [' ', makeKeyword('AS'), ' ', pathName] : '',
                ' ', makeKeyword('COLUMNS'), ' (',
                indent(nestedDocs.map((c) => [hardline, c])),
                hardline, ')', comma,
            ] as Doc;
        }

        const parts: Doc[] = [name, ' ', makeKeyword(typeName)];
        if (coltype === 'EXISTS') {
            parts.push(' ', makeKeyword('EXISTS PATH'), ' ', path ? printNode(path) : '');
        } else if (coltype === 'FORMATTED') {
            parts.push(' ', makeKeyword(propStr(col, 'format') ?? 'FORMAT JSON'));
            if (path) parts.push(' ', makeKeyword('PATH'), ' ', printNode(path));
        } else if (path) {
            parts.push(' ', makeKeyword('PATH'), ' ', printNode(path));
        }
        // An EXISTS column carries an implicit WITHOUT WRAPPER it can't be written with
        parts.push(printJsonQueryOptions(coltype === 'EXISTS' ? { ...col, props: { ...col.props, wrapper: null, quotes: null } } : col, opts, printNode));
        parts.push(comma);
        return parts as Doc;
    });
}
