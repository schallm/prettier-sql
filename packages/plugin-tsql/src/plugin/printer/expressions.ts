import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, getDensity, hardline, join, group, indent, line, softline, ifBreak, fill } from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName } from './helpers.js';

// ---------------------------------------------------------------------------
// Scalar expressions
// ---------------------------------------------------------------------------

export function printExpression(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'WildcardColumn':    return '*';
        case 'ColumnReference':   return printColumnRef(node);
        case 'IntegerLiteral':    return node.text ?? '0';
        case 'NumericLiteral':    return node.text ?? '0';
        case 'RealLiteral':       return node.text ?? '0';
        case 'MoneyLiteral':      return node.text ?? '0';
        case 'StringLiteral':     return `'${node.text ?? ''}'`;
        case 'BinaryLiteral':     return `0x${node.text ?? ''}`;
        case 'NullLiteral':       return keyword('NULL', opts);
        case 'BooleanLiteral':    return node.text?.toUpperCase() ?? 'TRUE';
        case 'VariableReference': return node.text ?? '@var';
        case 'GlobalVariable':    return node.text ?? '@@var';
        case 'SelectStar':        return '*';
        case 'SelectScalar':      return printSelectScalar(node, opts, printFn);
        case 'FunctionCall':      return printFunctionCall(node, opts, printFn);
        case 'BinaryExpression':  return printBinaryExpr(node, opts, printFn);
        case 'UnaryExpression':   return printUnaryExpr(node, opts, printFn);
        case 'ParenthesisExpression': return printParenExpr(node, opts, printFn);
        case 'CaseExpression':    return printCaseExpr(node, opts, printFn);
        case 'CastCall':          return printCastCall(node, opts, printFn);
        case 'ConvertCall':       return printConvertCall(node, opts, printFn);
        case 'IIfCall':           return printIIfCall(node, opts, printFn);
        case 'CoalesceExpression': return printCoalesceExpr(node, opts, printFn);
        case 'NullIfExpression':  return printNullIfExpr(node, opts, printFn);
        case 'TryCastCall':       return printTryCastCall(node, opts, printFn);
        case 'TryConvertCall':    return printTryConvertCall(node, opts, printFn);
        case 'AtTimeZoneCall':    return printAtTimeZone(node, opts, printFn);
        case 'ScalarSubquery':    return printScalarSubquery(node, opts, printFn);
        case 'OverClause':        return printOverClause(node, opts, printFn);
        case 'RollupSpec': return printGroupingSet('ROLLUP', node, opts, printFn);
        case 'CubeSpec':   return printGroupingSet('CUBE', node, opts, printFn);
        // Query nodes — appear as subqueries inside expressions
        case 'QuerySpecification':
        case 'BinaryQueryExpression':
        case 'QueryParenthesis':
            return printQueryExpression(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function printColumnRef(node: SqlNode): Doc {
    return node.text ?? (propArr(node, 'parts').join('.'));
}

function printSelectScalar(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expression');
    const alias = propStr(node, 'alias');
    const exprDoc = expr ? printExpression(expr, opts, printFn) : '';
    if (alias) {
        return [exprDoc, ' ', keyword('AS', opts), ' ', alias];
    }
    return exprDoc;
}

function printFunctionCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const name = propStr(node, 'name') ?? 'FUNC';
    const args = propArr(node, 'args').map((a) => printExpression(a, opts, printFn));
    const over = prop(node, 'over');
    const uniqueRowFilter = propStr(node, 'uniqueRowFilter');
    const distinctDoc = uniqueRowFilter === 'Distinct' ? [keyword('DISTINCT', opts), ' '] : [];

    const argsDoc = group([
        keyword(name, opts),
        '(',
        indent([softline, ...distinctDoc, join([',', line], args)]),
        softline,
        ')',
    ]);

    if (over) {
        return [argsDoc, ' ', keyword('OVER', opts), ' ', printOverClause(over, opts, printFn)];
    }
    return argsDoc;
}

// Flatten a left-recursive + (Add/Concatenate) chain into its leaf terms.
// Stops at any other operator so e.g. the `a * b` in `a * b + c` stays grouped.
function collectConcatChain(node: SqlNode): SqlNode[] {
    const op = propStr(node, 'operator');
    if (node.type !== 'BinaryExpression' || (op !== 'Add' && op !== 'Concatenate')) {
        return [node];
    }
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    return [
        ...(left ? collectConcatChain(left) : []),
        ...(right ? [right] : []),
    ];
}

function printBinaryExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const op = propStr(node, 'operator') ?? '+';

    // For + chains: flatten the whole tree and use fill so that terms pack
    // onto each line up to printWidth, breaking before + only when the next
    // term would overflow. Flat: "a + b + c". Filling: "a + b\n+ c + d".
    // This prevents Prettier from descending into function args to break there.
    if (op === 'Add' || op === 'Concatenate') {
        const terms = collectConcatChain(node);
        const termDocs = terms.map((t) => printExpression(t, opts, printFn));
        const parts: Doc[] = [termDocs[0]!];
        for (let i = 1; i < termDocs.length; i++) {
            parts.push([line, '+ ']);
            parts.push(termDocs[i]!);
        }
        return fill(parts);
    }

    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const opStr = mapBinaryOp(op);
    return group([
        left ? printExpression(left, opts, printFn) : '',
        ' ', opStr, ' ',
        right ? printExpression(right, opts, printFn) : '',
    ]);
}

function mapBinaryOp(op: string): string {
    const map: Record<string, string> = {
        Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Modulo: '%',
        BitwiseAnd: '&', BitwiseOr: '|', BitwiseXor: '^',
        Concatenate: '+',
    };
    return map[op] ?? op;
}

function printUnaryExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const op = propStr(node, 'operator') ?? '-';
    const opStr = op === 'Positive' ? '+' : op === 'Negative' ? '-' : op === 'BitwiseNot' ? '~' : op;
    return [opStr, expr ? printExpression(expr, opts, printFn) : ''];
}

function printParenExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    return ['(', expr ? printExpression(expr, opts, printFn) : '', ')'];
}

function printCaseExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const caseType = propStr(node, 'caseType');
    const whens = propArr(node, 'whens');
    const elseExpr = prop(node, 'else');
    const input = prop(node, 'input');

    const density = getDensity(opts);
    const whenDocs = whens.map((w) => {
        const whenExpr = prop(w, 'when');
        const thenExpr = prop(w, 'then');
        const isSearched = caseType === 'searched';
        const whenPart = isSearched && whenExpr
            ? printBoolExpr(whenExpr, opts, printFn)
            : whenExpr ? printExpression(whenExpr, opts, printFn) : keyword('NULL', opts);
        const thenPart = thenExpr ? printExpression(thenExpr, opts, printFn) : keyword('NULL', opts);
        // Nested CASE: break after THEN and indent the inner case block.
        const thenDoc: Doc = thenExpr?.type === 'CaseExpression'
            ? [keyword('THEN', opts), indent([hardline, thenPart])]
            : [keyword('THEN', opts), ' ', thenPart];
        const inline = isSearched && density !== 'spacious' && whenExpr?.type !== 'BooleanBinary';
        if (!isSearched || inline) {
            return [keyword('WHEN', opts), ' ', whenPart, ' ', thenDoc];
        }
        return [keyword('WHEN', opts), indent([hardline, whenPart]), hardline, thenDoc];
    });

    const elseDoc = elseExpr ? printExpression(elseExpr, opts, printFn) : null;
    const elsePart: Doc[] = elseDoc
        ? elseExpr?.type === 'CaseExpression'
            ? [hardline, keyword('ELSE', opts), indent([hardline, elseDoc])]
            : [hardline, keyword('ELSE', opts), ' ', elseDoc]
        : [];

    const inputPart = input ? [' ', printExpression(input, opts, printFn)] : [];

    return group([
        keyword('CASE', opts),
        ...inputPart,
        indent([
            ...whenDocs.map((w) => [hardline, ...w] as Doc),
            ...elsePart,
        ]),
        hardline,
        keyword('END', opts),
    ]);
}

function printCastCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    return [
        keyword('CAST', opts),
        '(',
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        keyword('AS', opts),
        ' ',
        keyword(dataType, opts),
        ')',
    ];
}

function printConvertCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const style = prop(node, 'style');
    const parts: Doc[] = [
        keyword('CONVERT', opts),
        '(',
        keyword(dataType, opts),
        ', ',
        expr ? printExpression(expr, opts, printFn) : '',
    ];
    if (style) {
        parts.push(', ', printExpression(style, opts, printFn));
    }
    parts.push(')');
    return parts;
}

function printIIfCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const condition = prop(node, 'condition');
    const trueVal   = prop(node, 'trueVal');
    const falseVal  = prop(node, 'falseVal');
    return [keyword('IIF', opts), '(',
        condition ? printBoolExpr(condition, opts, printFn) : '', ', ',
        trueVal   ? printExpression(trueVal, opts, printFn)  : '', ', ',
        falseVal  ? printExpression(falseVal, opts, printFn) : '',
    ')'];
}

function printCoalesceExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const args = propArr(node, 'args');
    return [keyword('COALESCE', opts), '(',
        join(', ', args.map((a) => printExpression(a, opts, printFn))),
    ')'];
}

function printNullIfExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const first  = prop(node, 'first');
    const second = prop(node, 'second');
    return [keyword('NULLIF', opts), '(',
        first  ? printExpression(first, opts, printFn)  : '', ', ',
        second ? printExpression(second, opts, printFn) : '',
    ')'];
}

function printTryCastCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr     = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    return [keyword('TRY_CAST', opts), '(',
        expr ? printExpression(expr, opts, printFn) : '',
        ' ', keyword('AS', opts), ' ', keyword(dataType, opts),
    ')'];
}

function printTryConvertCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr     = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const style    = prop(node, 'style');
    const parts: Doc[] = [keyword('TRY_CONVERT', opts), '(', keyword(dataType, opts), ', ',
        expr ? printExpression(expr, opts, printFn) : ''];
    if (style) parts.push(', ', printExpression(style, opts, printFn));
    parts.push(')');
    return parts;
}

function printAtTimeZone(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const source   = prop(node, 'source');
    const timeZone = prop(node, 'timeZone');
    return [
        source   ? printExpression(source, opts, printFn)   : '',
        ' ', keyword('AT TIME ZONE', opts), ' ',
        timeZone ? printExpression(timeZone, opts, printFn) : '',
    ];
}

function printScalarSubquery(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const query = prop(node, 'query');
    if (!query) return '(/* subquery */)';
    return ['(', indent([hardline, printQueryExpression(query, opts, printFn)]), hardline, ')'];
}

// ---------------------------------------------------------------------------
// Query expressions (SELECT, UNION, etc.) — kept here to avoid circular imports
// with statements.ts which handles top-level statement formatting.
// ---------------------------------------------------------------------------

export function printQueryExpression(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'QuerySpecification':    return printQuerySpec(node, opts, printFn);
        case 'BinaryQueryExpression': return printBinaryQuery(node, opts, printFn);
        case 'QueryParenthesis': {
            const q = prop(node, 'query');
            return q ? ['(', indent([hardline, printQueryExpression(q, opts, printFn)]), hardline, ')'] : '()';
        }
        case 'QueryDerivedTable': {
            const q = prop(node, 'query');
            const alias = propStr(node, 'alias');
            const inner = q ? printQueryExpression(q, opts, printFn) : '/* query */';
            return alias
                ? ['(', indent([hardline, inner]), hardline, ') ', keyword('AS', opts), ' ', alias]
                : ['(', indent([hardline, inner]), hardline, ')'];
        }
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function printQuerySpec(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const density = getDensity(opts);
    const uniqueRowFilter = propStr(node, 'uniqueRowFilter');
    const top = prop(node, 'top');
    const selectElements = propArr(node, 'selectElements');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const groupBy = prop(node, 'groupBy');
    const having = prop(node, 'having');
    const orderBy = prop(node, 'orderBy');

    const selectKw = uniqueRowFilter === 'Distinct'
        ? keyword('SELECT DISTINCT', opts)
        : keyword('SELECT', opts);

    const topDoc = top ? printTop(top, opts, printFn) : null;
    const colDocs = selectElements.map((se) => printExpression(se, opts, printFn));

    if (density === 'compact') {
        // Compact: try to keep everything inline; wrap at printWidth
        const colList = group(join([',', line], colDocs));
        const parts: Doc[] = [selectKw, ...(topDoc ? [' ', topDoc] : []), ' ', colList];

        if (from) {
            const tableRefs = propArr(from, 'tableReferences');
            const fromDocs = tableRefs.map((tr) => printTableRef(tr, opts, printFn));
            // Try to keep FROM on one line; if too long, each join on its own line
            parts.push(line, keyword('FROM', opts), ' ', group(join([',', line], fromDocs)));
        }

        if (where) {
            parts.push(line, keyword('WHERE', opts), ' ', boolWithTrailing(where, printBoolExpr(where, opts, printFn)));
        }

        if (groupBy) {
            const elems = propArr(groupBy, 'elements');
            const elemDocs = elems.map((e) => printExpression(e, opts, printFn));
            parts.push(line, keyword('GROUP BY', opts), ' ', join([',', line], elemDocs));
        }

        if (having) {
            parts.push(line, keyword('HAVING', opts), ' ', boolWithTrailing(having, printBoolExpr(having, opts, printFn)));
        }

        if (orderBy) {
            parts.push(line, printOrderByClause(orderBy, opts, printFn));
        }

        return group(parts);
    }

    // Standard / Spacious: single column stays inline; multiple each on own line
    const colList: Doc = density === 'standard' && colDocs.length === 1
        ? [' ', colDocs[0]!]
        : indent([hardline, join([',', hardline], colDocs)]);
    const parts: Doc[] = [selectKw, ...(topDoc ? [' ', topDoc] : []), colList];

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        const fromDocs = tableRefs.map((tr) => printTableRef(tr, opts, printFn));
        // standard: single table (no joins) stays inline; multiple/joins each on own line
        const singleTable = density === 'standard'
            && tableRefs.length === 1
            && tableRefs[0]!.type !== 'QualifiedJoin'
            && tableRefs[0]!.type !== 'UnqualifiedJoin';
        if (singleTable) {
            parts.push(hardline, keyword('FROM', opts), ' ', fromDocs[0]!);
        } else {
            parts.push(hardline, keyword('FROM', opts), indent([hardline, join([',', hardline], fromDocs)]));
        }
    }

    if (where) {
        // standard: single predicate inline; multiple each on own line
        // spacious: always indented
        const inline = density === 'standard' && where.type !== 'BooleanBinary';
        if (inline) {
            parts.push(hardline, keyword('WHERE', opts), ' ', boolWithTrailing(where, printBoolExpr(where, opts, printFn)));
        } else {
            parts.push(hardline, keyword('WHERE', opts), indent([hardline, boolWithTrailing(where, printBoolExpr(where, opts, printFn))]));
        }
    }

    if (groupBy) {
        const elems = propArr(groupBy, 'elements');
        const elemDocs = elems.map((e) => printExpression(e, opts, printFn));
        const inline = density === 'standard' && elems.length === 1;
        if (inline) {
            parts.push(hardline, keyword('GROUP BY', opts), ' ', elemDocs[0]!);
        } else {
            parts.push(hardline, keyword('GROUP BY', opts), indent([hardline, join([',', hardline], elemDocs)]));
        }
    }

    if (having) {
        const inline = density === 'standard' && having.type !== 'BooleanBinary';
        if (inline) {
            parts.push(hardline, keyword('HAVING', opts), ' ', boolWithTrailing(having, printBoolExpr(having, opts, printFn)));
        } else {
            parts.push(hardline, keyword('HAVING', opts), indent([hardline, boolWithTrailing(having, printBoolExpr(having, opts, printFn))]));
        }
    }

    if (orderBy) {
        parts.push(hardline, printOrderByClause(orderBy, opts, printFn));
    }

    return group(parts);
}

function printTop(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expression');
    const isPercent = propBool(node, 'percent');
    const withTies = propBool(node, 'withTies');
    const parts: Doc[] = [keyword('TOP', opts), ' (', expr ? printExpression(expr, opts, printFn) : '', ')'];
    if (isPercent) parts.push(' ', keyword('PERCENT', opts));
    if (withTies) parts.push(' ', keyword('WITH TIES', opts));
    return parts;
}

function printGroupingSet(kw: string, node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const exprs = propArr(node, 'expressions').map((e) => printExpression(e, opts, printFn));
    return group([keyword(kw, opts), '(', indent([softline, join([',', line], exprs)]), softline, ')']);
}

function printBinaryQuery(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'operator') ?? 'Union';
    const isAll = propBool(node, 'all');

    const opKw = op === 'Union' ? keyword('UNION', opts)
        : op === 'Intersect' ? keyword('INTERSECT', opts)
        : keyword('EXCEPT', opts);

    return [
        left ? printQueryExpression(left, opts, printFn) : '',
        hardline, hardline,
        opKw,
        isAll ? [' ', keyword('ALL', opts)] : '',
        hardline, hardline,
        right ? printQueryExpression(right, opts, printFn) : '',
    ];
}

export function printOverClause(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const partitions = propArr(node, 'partitionBy');
    const orderBy = prop(node, 'orderBy');

    const parts: Doc[] = [];

    if (partitions.length > 0) {
        parts.push(
            keyword('PARTITION BY', opts),
            ' ',
            join([',', line], partitions.map((p) => printExpression(p, opts, printFn)))
        );
    }

    if (orderBy) {
        if (parts.length > 0) parts.push(hardline);
        parts.push(printOrderByClause(orderBy, opts, printFn));
    }

    return group(['(', indent([softline, ...parts]), softline, ')']);
}

// ---------------------------------------------------------------------------
// Boolean expressions
// ---------------------------------------------------------------------------

export function printBoolExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'BooleanComparison':  return printBoolComparison(node, opts, printFn);
        case 'BooleanBinary':      return printBoolBinary(node, opts, printFn);
        case 'BooleanNot':         return printBoolNot(node, opts, printFn);
        case 'BooleanParenthesis': return printBoolParen(node, opts, printFn);
        case 'IsNullExpression':   return printIsNull(node, opts, printFn);
        case 'InPredicate':        return printInPredicate(node, opts, printFn);
        case 'LikePredicate':      return printLikePredicate(node, opts, printFn);
        case 'ExistsPredicate':    return printExistsPredicate(node, opts, printFn);
        case 'BetweenExpression':  return printBetween(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function cmpOp(op: string): string {
    const map: Record<string, string> = {
        Equals: '=', NotEqualToBrackets: '<>', NotEqualToExclamation: '!=',
        GreaterThan: '>', LessThan: '<',
        GreaterThanOrEqualTo: '>=', LessThanOrEqualTo: '<=',
        LeftOuterJoin: '*=', RightOuterJoin: '=*',
        NotLessThan: '!<', NotGreaterThan: '!>',
    };
    return map[op] ?? op;
}

function printBoolComparison(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = cmpOp(propStr(node, 'operator') ?? '=');
    return group([
        left ? printExpression(left, opts, printFn) : '',
        ' ', op, ' ',
        right ? printExpression(right, opts, printFn) : '',
    ]);
}

// Walk to the rightmost non-BooleanBinary leaf of a boolean subtree.
function rightmostPred(node: SqlNode | null | undefined): SqlNode | null {
    if (!node) return null;
    if (node.type === 'BooleanBinary') return rightmostPred(prop(node, 'right'));
    return node;
}

// Append any trailing comment on the rightmost predicate leaf to the doc.
function boolWithTrailing(node: SqlNode, doc: Doc): Doc {
    const trailing = rightmostPred(node)?.trailingComment;
    if (!trailing) return doc;
    return [doc, ...trailing.split('\n').flatMap((c): Doc[] => [hardline, c])];
}

function printBoolBinary(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'operator') === 'Or' ? keyword('OR', opts) : keyword('AND', opts);
    // compact: stay inline, wrap at printWidth; standard/spacious: each predicate on own line
    const sep = getDensity(opts) === 'compact' ? line : hardline;

    const leftDoc: Doc = left ? printBoolExpr(left, opts, printFn) : '';
    const rightDoc: Doc = right ? printBoolExpr(right, opts, printFn) : '';

    // A comment attached to the rightmost leaf of the left subtree means a
    // commented-out predicate sits between left and right in the source.
    // The parent BooleanBinary always handles it — never the level that holds
    // the predicate as its own right child — so no double-printing occurs.
    const betweenComment = rightmostPred(left)?.trailingComment;
    if (betweenComment) {
        const commentLines: Doc[] = betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c]);
        return group([leftDoc, ...commentLines, hardline, op, ' ', rightDoc]);
    }

    return group([leftDoc, sep, op, ' ', rightDoc]);
}

function printBoolNot(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    return [keyword('NOT', opts), ' ', expr ? printBoolExpr(expr, opts, printFn) : ''];
}

function printBoolParen(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    if (!expr) return '()';
    return group(['(', indent([softline, printBoolExpr(expr, opts, printFn)]), softline, ')']);
}

function printIsNull(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const isNot = propBool(node, 'isNot');
    return [
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        keyword('IS', opts),
        isNot ? [' ', keyword('NOT', opts)] : '',
        ' ',
        keyword('NULL', opts),
    ];
}

function printInPredicate(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const isNot = propBool(node, 'negated');
    const values = propArr(node, 'values');
    const subquery = prop(node, 'subquery');

    const lhs: Doc[] = [
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        ...(isNot ? [keyword('NOT', opts), ' '] : []),
        keyword('IN', opts),
    ];

    if (subquery) {
        // Subquery: keep existing softline/indent behaviour
        return [
            ...lhs,
            ' (',
            indent([softline, printQueryExpression(subquery, opts, printFn)]),
            softline,
            ')',
        ];
    }

    // Value list: all inline when it fits; when it doesn't, each value on its
    // own indented line with ) dropping back to the indentation of the IN line.
    const valueDocs = values.map((v) => printExpression(v, opts, printFn));
    return [
        ...lhs,
        group([
            ' (',
            indent([softline, join([',', line], valueDocs)]),
            softline,
            ')',
        ]),
    ];
}

function printLikePredicate(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const pattern = prop(node, 'pattern');
    const isNot = propBool(node, 'negated');
    const escape = prop(node, 'escape');

    const parts: Doc[] = [
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        isNot ? [keyword('NOT', opts), ' '] : '',
        keyword('LIKE', opts),
        ' ',
        pattern ? printExpression(pattern, opts, printFn) : '',
    ];
    if (escape) {
        parts.push(' ', keyword('ESCAPE', opts), ' ', printExpression(escape, opts, printFn));
    }
    return parts;
}

function printExistsPredicate(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const subquery = prop(node, 'subquery');
    if (!subquery) return keyword('EXISTS', opts) + '()';
    return [keyword('EXISTS', opts), ' (', indent([hardline, printQueryExpression(subquery, opts, printFn)]), hardline, ')'];
}

function printBetween(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const from = prop(node, 'from');
    const to = prop(node, 'to');
    const isNot = propBool(node, 'negated');
    return [
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        isNot ? [keyword('NOT', opts), ' '] : '',
        keyword('BETWEEN', opts),
        ' ',
        from ? printExpression(from, opts, printFn) : '',
        ' ',
        keyword('AND', opts),
        ' ',
        to ? printExpression(to, opts, printFn) : '',
    ];
}

// ---------------------------------------------------------------------------
// FROM / JOIN
// ---------------------------------------------------------------------------

export function printTableRef(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'NamedTableReference':    return printNamedTableRef(node, opts);
        case 'VariableTableReference': return node.text ?? '/* unknown table var */';
        case 'QualifiedJoin':               return printQualifiedJoin(node, opts, printFn);
        case 'UnqualifiedJoin':             return printUnqualifiedJoin(node, opts, printFn);
        case 'JoinParenthesisTableReference': return printJoinParenthesis(node, opts, printFn);
        case 'QueryDerivedTable':           return printQueryDerivedTable(node, opts, printFn);
        case 'SchemaObjectFunctionTableReference': return printSchemaObjectFunctionTableRef(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function printNamedTableRef(node: SqlNode, opts: Options): Doc {
    const alias = propStr(node, 'alias');
    const hints = node.props?.['hints'] as string[] | undefined;
    const nameDoc: Doc = schemaObjectName(prop(node, 'name'));
    const aliasDoc: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    const hintsDoc: Doc = hints?.length
        ? [' ', keyword('WITH', opts), ' (', join(', ', hints.map((h) => keyword(h, opts))), ')']
        : '';
    return [nameDoc, aliasDoc, hintsDoc];
}

function joinTypeKeyword(jt: string, opts: Options): Doc {
    const map: Record<string, string> = {
        Inner: 'INNER JOIN',
        LeftOuter: 'LEFT JOIN',
        RightOuter: 'RIGHT JOIN',
        FullOuter: 'FULL JOIN',
        Cross: 'CROSS JOIN',
    };
    const kw = map[jt] ?? `${jt} JOIN`;
    return keyword(kw, opts);
}

/**
 * Walk the rightmost path of an AST subtree (props in reverse insertion order)
 * to find a trailingComment, but only on nodes whose endOffset equals
 * targetEndOffset.  This constraint is essential: Pass 3 routes a between-join
 * comment to the rightmost descendant of the *direct* left-child join (i.e.
 * a node whose endOffset equals left.endOffset).  Without this restriction,
 * subsequent joins would walk back through the entire ancestor chain and
 * re-discover the same comment on every subsequent gap.
 */
function rightmostTrailingComment(node: SqlNode | null, targetEndOffset: number): string | undefined {
    if (!node || node.endOffset !== targetEndOffset) return undefined;
    if (node.trailingComment) return node.trailingComment;
    const props = node.props;
    if (!props) return undefined;
    const vals = Object.values(props);
    for (let i = vals.length - 1; i >= 0; i--) {
        const v = vals[i];
        if (v && typeof v === 'object' && 'type' in (v as object)) {
            const found = rightmostTrailingComment(v as SqlNode, targetEndOffset);
            if (found) return found;
        }
    }
    return undefined;
}

function printQualifiedJoin(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const density = getDensity(opts);
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const condition = prop(node, 'condition');
    const jt = propStr(node, 'joinType') ?? 'Inner';

    // compact: try to keep joins on one line (line = space when flat)
    // standard/spacious: always new line before each JOIN keyword
    const joinBreak = density === 'compact' ? line : hardline;

    let onDoc: Doc = '';
    if (condition) {
        const isMultiple = condition.type === 'BooleanBinary';
        if (density === 'compact') {
            // inline with JOIN, wraps at printWidth via BoolBinary using `line`
            onDoc = [' ', keyword('ON', opts), ' ', printBoolExpr(condition, opts, printFn)];
        } else if (density === 'standard' && !isMultiple) {
            // single predicate: ON stays on join line, predicate wraps below if too long
            onDoc = [' ', keyword('ON', opts), group([indent([line, printBoolExpr(condition, opts, printFn)])])];
        } else {
            // standard (multiple) or spacious (always): ON on join line, predicates indented below
            onDoc = [' ', keyword('ON', opts), indent([hardline, printBoolExpr(condition, opts, printFn)])];
        }
    }

    const leftDoc = left ? printTableRef(left, opts, printFn) : '';

    // A comment between two JOIN clauses lands on the rightmost descendant of
    // the left-child join (via Pass 3 `>=` tie-breaking).  Restrict search to
    // nodes whose endOffset == left.endOffset so subsequent joins don't
    // re-discover the same comment from an ancestor.
    const betweenComment = left ? rightmostTrailingComment(left, left.endOffset) : undefined;
    const commentLines: Doc[] = betweenComment
        ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c])
        : [];
    const separator: Doc = commentLines.length > 0
        ? [...commentLines, hardline]
        : joinBreak;

    return [leftDoc, separator, joinTypeKeyword(jt, opts), ' ', right ? printTableRef(right, opts, printFn) : '', onDoc];
}

function printUnqualifiedJoin(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const jt = propStr(node, 'joinType') ?? 'Cross';
    const kw = jt === 'Cross' ? keyword('CROSS JOIN', opts) : keyword('CROSS APPLY', opts);

    const leftDoc = left ? printTableRef(left, opts, printFn) : '';
    // Unqualified joins have no condition; comment lands on left node itself.
    const betweenComment = left ? rightmostTrailingComment(left, left.endOffset) : undefined;
    const commentLines: Doc[] = betweenComment
        ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c])
        : [];
    const separator: Doc = commentLines.length > 0
        ? [...commentLines, hardline]
        : hardline;

    return [leftDoc, separator, kw, ' ', right ? printTableRef(right, opts, printFn) : ''];
}

function printJoinParenthesis(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const join = prop(node, 'join');
    const joinDoc = join ? printTableRef(join, opts, printFn) : '';
    return ['(', indent([hardline, joinDoc]), hardline, ')'];
}

function printQueryDerivedTable(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const query = prop(node, 'query');
    const alias = propStr(node, 'alias');
    const queryDoc = query ? printQueryExpression(query, opts, printFn) : '/* query */';
    if (alias) {
        return ['(', indent([hardline, queryDoc]), hardline, ') ', keyword('AS', opts), ' ', alias];
    }
    return ['(', indent([hardline, queryDoc]), hardline, ')'];
}

function printSchemaObjectFunctionTableRef(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const args  = propArr(node, 'args');
    const alias = propStr(node, 'alias');
    const argsDoc: Doc = join(', ', args.map((a) => printExpression(a, opts, printFn)));
    const aliasDoc: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [schemaObjectName(prop(node, 'name')), '(', argsDoc, ')', aliasDoc];
}

// ---------------------------------------------------------------------------
// ORDER BY
// ---------------------------------------------------------------------------

export function printOrderByClause(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const density = getDensity(opts);
    const elements = propArr(node, 'elements');
    const elDocs = elements.map((e) => {
        const expr = prop(e, 'expression');
        const sort = propStr(e, 'sortOrder');
        const sortDoc = sort === 'Descending' ? [' ', keyword('DESC', opts)] : [' ', keyword('ASC', opts)];
        return [expr ? printExpression(expr, opts, printFn) : '', ...sortDoc] as Doc;
    });
    // compact: inline with ORDER BY, wraps; standard + single: inline; else: each on own line
    if (density === 'compact') {
        return [keyword('ORDER BY', opts), ' ', join([',', line], elDocs)];
    }
    if (density === 'standard' && elements.length === 1) {
        return [keyword('ORDER BY', opts), ' ', elDocs[0]!];
    }
    return [keyword('ORDER BY', opts), indent([hardline, join([',', hardline], elDocs)])];
}
