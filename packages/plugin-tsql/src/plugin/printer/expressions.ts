import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import {
    keyword,
    getDensity,
    hardSep,
    softSep,
    hardline,
    join,
    group,
    indent,
    line,
    softline,
    ifBreak,
    fill,
} from './utils.js';
import { prop, propArr, propStr, propBool, schemaObjectName, assignmentOp } from './helpers.js';

// ---------------------------------------------------------------------------
// Scalar expressions
// ---------------------------------------------------------------------------

export function printExpression(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'WildcardColumn':
            return '*';
        case 'ColumnReference':
            return printColumnRef(node);
        case 'IntegerLiteral':
            return node.text ?? '0';
        case 'NumericLiteral':
            return node.text ?? '0';
        case 'RealLiteral':
            return node.text ?? '0';
        case 'MoneyLiteral':
            return node.text ?? '0';
        case 'StringLiteral':
            return `'${node.text ?? ''}'`;
        case 'BinaryLiteral':
            return `0x${node.text ?? ''}`;
        case 'NullLiteral':
            return keyword('NULL', opts);
        case 'BooleanLiteral':
            return node.text?.toUpperCase() ?? 'TRUE';
        case 'VariableReference':
            return node.text ?? '@var';
        case 'GlobalVariable':
            return node.text ?? '@@var';
        case 'SelectStar':
            return node.text ?? '*';
        case 'SelectScalar':
            return printSelectScalar(node, opts, printFn);
        case 'SelectSetVariable':
            return printSelectSetVariable(node, opts, printFn);
        case 'FunctionCall':
            return printFunctionCall(node, opts, printFn);
        case 'BinaryExpression':
            return printBinaryExpr(node, opts, printFn);
        case 'UnaryExpression':
            return printUnaryExpr(node, opts, printFn);
        case 'ParenthesisExpression':
            return printParenExpr(node, opts, printFn);
        case 'CaseExpression':
            return printCaseExpr(node, opts, printFn);
        case 'CastCall':
            return printCastCall(node, opts, printFn);
        case 'ConvertCall':
            return printConvertCall(node, opts, printFn);
        case 'IIfCall':
            return printIIfCall(node, opts, printFn);
        case 'CoalesceExpression':
            return printCoalesceExpr(node, opts, printFn);
        case 'NullIfExpression':
            return printNullIfExpr(node, opts, printFn);
        case 'TryCastCall':
            return printTryCastCall(node, opts, printFn);
        case 'TryConvertCall':
            return printTryConvertCall(node, opts, printFn);
        case 'AtTimeZoneCall':
            return printAtTimeZone(node, opts, printFn);
        case 'ScalarSubquery':
            return printScalarSubquery(node, opts, printFn);
        case 'OverClause':
            return printOverClause(node, opts, printFn);
        case 'RollupSpec':
            return printGroupingSet('ROLLUP', node, opts, printFn);
        case 'CubeSpec':
            return printGroupingSet('CUBE', node, opts, printFn);
        case 'GroupingSetsSpec':
            return printGroupingSets(node, opts, printFn);
        case 'CompositeGroupingSpec':
            return printCompositeGroup(node, opts, printFn);
        case 'GrandTotalSpec':
            return '()';
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
    return node.text ?? propArr(node, 'parts').join('.');
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

function printSelectSetVariable(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const varName = propStr(node, 'variable') ?? '@var';
    const op = assignmentOp(propStr(node, 'operator') ?? 'Equals');
    const val = prop(node, 'value');
    return [varName, ' ', op, ' ', val ? printExpression(val, opts, printFn) : ''];
}

function printNullOnNullClause(node: SqlNode, opts: Options): Doc {
    const raw = propStr(node, 'nullOnNull');
    if (!raw) return '';
    // ScriptDom gives only the first keyword: 'absent' or 'NULL'
    return raw.toLowerCase() === 'absent' ? keyword('ABSENT ON NULL', opts) : keyword('NULL ON NULL', opts);
}

function printJsonKeyValue(kv: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const keyNode = prop(kv, 'key');
    const valNode = prop(kv, 'value');
    const keyDoc = keyNode ? printExpression(keyNode, opts, printFn) : '';
    const valDoc = valNode ? printExpression(valNode, opts, printFn) : '';
    return [keyDoc, ': ', valDoc];
}

function printFunctionCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const name = propStr(node, 'name') ?? 'FUNC';
    const args = propArr(node, 'args').map((a) => printExpression(a, opts, printFn));
    const over = prop(node, 'over');
    const uniqueRowFilter = propStr(node, 'uniqueRowFilter');
    const distinctDoc = uniqueRowFilter === 'Distinct' ? [keyword('DISTINCT', opts), ' '] : [];
    const nullOnNullDoc = printNullOnNullClause(node, opts);

    // TRIM(LEADING|TRAILING|BOTH [chars] FROM str) — SQL Server 2022+
    const trimOptions = propStr(node, 'trimOptions');
    if (trimOptions && name.toUpperCase() === 'TRIM') {
        const dirDoc = keyword(trimOptions.toUpperCase(), opts);
        if (args.length === 2) {
            return group([
                keyword('TRIM', opts),
                '(',
                indent([softline, dirDoc, ' ', args[0]!, ' ', keyword('FROM', opts), line, args[1]!]),
                softline,
                ')',
            ]);
        } else if (args.length === 1) {
            return group([
                keyword('TRIM', opts),
                '(',
                indent([softline, dirDoc, ' ', keyword('FROM', opts), line, args[0]!]),
                softline,
                ')',
            ]);
        }
    }

    // JSON_OBJECT('key': value [, ...] [ABSENT ON NULL | NULL ON NULL]) — SQL Server 2022+
    const jsonParams = propArr(node, 'jsonParams');
    if (jsonParams.length > 0) {
        const pairs = jsonParams.map((kv) => printJsonKeyValue(kv, opts, printFn));
        const nullClause: Doc = nullOnNullDoc ? [' ', nullOnNullDoc] : '';
        return group([
            keyword(name, opts),
            '(',
            indent([softline, join([',', line], pairs), nullClause]),
            softline,
            ')',
        ]);
    }

    // JSON_ARRAYAGG(expr [ORDER BY ...] [ABSENT ON NULL | NULL ON NULL]) — SQL Server 2022+
    const jsonOrderBy = prop(node, 'jsonOrderBy');
    if (jsonOrderBy && name.toUpperCase() === 'JSON_ARRAYAGG') {
        const orderByDoc = printOrderByClause(jsonOrderBy, opts, printFn);
        const nullClause: Doc = nullOnNullDoc ? [' ', nullOnNullDoc] : '';
        return group([
            keyword(name, opts),
            '(',
            indent([softline, join([',', line], args), ' ', orderByDoc, nullClause]),
            softline,
            ')',
        ]);
    }

    // Standard function call (JSON_ARRAY and others with optional ABSENT/NULL ON NULL)
    const nullClause: Doc = nullOnNullDoc ? [' ', nullOnNullDoc] : '';
    const argsDoc = group([
        keyword(name, opts),
        '(',
        indent([softline, ...distinctDoc, join([',', line], args), nullClause]),
        softline,
        ')',
    ]);

    // IGNORE NULLS / RESPECT NULLS modifier — SQL Server 2022+
    const nullsModifier = propStr(node, 'nulls');
    const nullsDoc: Doc = nullsModifier ? [' ', keyword(nullsModifier.toUpperCase(), opts)] : '';

    if (over) {
        return [argsDoc, nullsDoc, ' ', keyword('OVER', opts), ' ', printOverClause(over, opts, printFn)];
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
    return [...(left ? collectConcatChain(left) : []), ...(right ? [right] : [])];
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
        ' ',
        opStr,
        ' ',
        right ? printExpression(right, opts, printFn) : '',
    ]);
}

function mapBinaryOp(op: string): string {
    const map: Record<string, string> = {
        Add: '+',
        Subtract: '-',
        Multiply: '*',
        Divide: '/',
        Modulo: '%',
        BitwiseAnd: '&',
        BitwiseOr: '|',
        BitwiseXor: '^',
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
        const whenPart =
            isSearched && whenExpr
                ? printBoolExpr(whenExpr, opts, printFn)
                : whenExpr
                  ? printExpression(whenExpr, opts, printFn)
                  : keyword('NULL', opts);
        const thenPart = thenExpr ? printExpression(thenExpr, opts, printFn) : keyword('NULL', opts);
        // Nested CASE: break after THEN and indent the inner case block.
        const thenDoc: Doc =
            thenExpr?.type === 'CaseExpression'
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
        indent([...whenDocs.map((w) => [hardline, ...w] as Doc), ...elsePart]),
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
    const trueVal = prop(node, 'trueVal');
    const falseVal = prop(node, 'falseVal');
    return [
        keyword('IIF', opts),
        '(',
        condition ? printBoolExpr(condition, opts, printFn) : '',
        ', ',
        trueVal ? printExpression(trueVal, opts, printFn) : '',
        ', ',
        falseVal ? printExpression(falseVal, opts, printFn) : '',
        ')',
    ];
}

function printCoalesceExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const args = propArr(node, 'args');
    return [
        keyword('COALESCE', opts),
        '(',
        join(
            ', ',
            args.map((a) => printExpression(a, opts, printFn)),
        ),
        ')',
    ];
}

function printNullIfExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const first = prop(node, 'first');
    const second = prop(node, 'second');
    return [
        keyword('NULLIF', opts),
        '(',
        first ? printExpression(first, opts, printFn) : '',
        ', ',
        second ? printExpression(second, opts, printFn) : '',
        ')',
    ];
}

function printTryCastCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    return [
        keyword('TRY_CAST', opts),
        '(',
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        keyword('AS', opts),
        ' ',
        keyword(dataType, opts),
        ')',
    ];
}

function printTryConvertCall(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const style = prop(node, 'style');
    const parts: Doc[] = [
        keyword('TRY_CONVERT', opts),
        '(',
        keyword(dataType, opts),
        ', ',
        expr ? printExpression(expr, opts, printFn) : '',
    ];
    if (style) parts.push(', ', printExpression(style, opts, printFn));
    parts.push(')');
    return parts;
}

function printAtTimeZone(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const source = prop(node, 'source');
    const timeZone = prop(node, 'timeZone');
    return [
        source ? printExpression(source, opts, printFn) : '',
        ' ',
        keyword('AT TIME ZONE', opts),
        ' ',
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
        case 'QuerySpecification':
            return printQuerySpec(node, opts, printFn);
        case 'BinaryQueryExpression':
            return printBinaryQuery(node, opts, printFn);
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
    const windowDefs = propArr(node, 'windowDefs');

    const selectKw = uniqueRowFilter === 'Distinct' ? keyword('SELECT DISTINCT', opts) : keyword('SELECT', opts);

    const topDoc = top ? printTop(top, opts, printFn) : null;
    const colDocs = selectElements.map((se) => printExpression(se, opts, printFn));

    if (density === 'compact') {
        // Compact: try to keep everything inline; wrap at printWidth
        const colList = group(join(softSep(opts), colDocs));
        const parts: Doc[] = [selectKw, ...(topDoc ? [' ', topDoc] : []), ' ', colList];

        if (from) {
            const tableRefs = propArr(from, 'tableReferences');
            const fromDocs = tableRefs.map((tr) => printTableRef(tr, opts, printFn));
            // Try to keep FROM on one line; if too long, each join on its own line
            parts.push(line, keyword('FROM', opts), ' ', group(join(softSep(opts), fromDocs)));
        }

        if (where) {
            parts.push(line, keyword('WHERE', opts), ' ', boolWithTrailing(where, printBoolExpr(where, opts, printFn)));
        }

        if (groupBy) {
            const elems = propArr(groupBy, 'elements');
            const elemDocs = elems.map((e) => printExpression(e, opts, printFn));
            parts.push(line, keyword('GROUP BY', opts), ' ', join(softSep(opts), elemDocs));
        }

        if (having) {
            parts.push(
                line,
                keyword('HAVING', opts),
                ' ',
                boolWithTrailing(having, printBoolExpr(having, opts, printFn)),
            );
        }

        if (orderBy) {
            parts.push(line, printOrderByClause(orderBy, opts, printFn));
        }

        if (windowDefs.length > 0) {
            parts.push(line, printWindowClause(windowDefs, opts, printFn));
        }

        return group(parts);
    }

    // Standard / Spacious: single column stays inline; multiple each on own line.
    // A CASE expression always expands to multiple lines, so force it onto its own indented line.
    const singleExprType = (prop(selectElements[0], 'expression') ?? selectElements[0])?.type;
    const colList: Doc =
        density === 'standard' && colDocs.length === 1 && singleExprType !== 'CaseExpression'
            ? [' ', colDocs[0]!]
            : indent([hardline, join(hardSep(opts), colDocs)]);
    const parts: Doc[] = [selectKw, ...(topDoc ? [' ', topDoc] : []), colList];

    if (from) {
        const tableRefs = propArr(from, 'tableReferences');
        const fromDocs = tableRefs.map((tr) => printTableRef(tr, opts, printFn));
        // standard: single table (no joins) stays inline; multiple/joins each on own line
        const singleTable =
            density === 'standard' &&
            tableRefs.length === 1 &&
            tableRefs[0]!.type !== 'QualifiedJoin' &&
            tableRefs[0]!.type !== 'UnqualifiedJoin';
        if (singleTable) {
            parts.push(hardline, keyword('FROM', opts), ' ', fromDocs[0]!);
        } else {
            parts.push(hardline, keyword('FROM', opts), indent([hardline, join(hardSep(opts), fromDocs)]));
        }
    }

    if (where) {
        // standard: single predicate inline; multiple each on own line
        // spacious: always indented
        const inline = density === 'standard' && where.type !== 'BooleanBinary';
        if (inline) {
            parts.push(
                hardline,
                keyword('WHERE', opts),
                ' ',
                boolWithTrailing(where, printBoolExpr(where, opts, printFn)),
            );
        } else {
            parts.push(
                hardline,
                keyword('WHERE', opts),
                indent([hardline, boolWithTrailing(where, printBoolExpr(where, opts, printFn))]),
            );
        }
    }

    if (groupBy) {
        const elems = propArr(groupBy, 'elements');
        const elemDocs = elems.map((e) => printExpression(e, opts, printFn));
        const inline = density === 'standard' && elems.length === 1;
        if (inline) {
            parts.push(hardline, keyword('GROUP BY', opts), ' ', elemDocs[0]!);
        } else {
            parts.push(hardline, keyword('GROUP BY', opts), indent([hardline, join(hardSep(opts), elemDocs)]));
        }
    }

    if (having) {
        const inline = density === 'standard' && having.type !== 'BooleanBinary';
        if (inline) {
            parts.push(
                hardline,
                keyword('HAVING', opts),
                ' ',
                boolWithTrailing(having, printBoolExpr(having, opts, printFn)),
            );
        } else {
            parts.push(
                hardline,
                keyword('HAVING', opts),
                indent([hardline, boolWithTrailing(having, printBoolExpr(having, opts, printFn))]),
            );
        }
    }

    if (orderBy) {
        parts.push(hardline, printOrderByClause(orderBy, opts, printFn));
    }

    if (windowDefs.length > 0) {
        parts.push(hardline, printWindowClause(windowDefs, opts, printFn));
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

function printGroupingSets(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const sets = propArr(node, 'sets').map((s) => printExpression(s, opts, printFn));
    return group([keyword('GROUPING SETS', opts), '(', indent([softline, join([',', line], sets)]), softline, ')']);
}

function printCompositeGroup(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const items = propArr(node, 'items').map((e) => printExpression(e, opts, printFn));
    return group(['(', indent([softline, join([',', line], items)]), softline, ')']);
}

function printBinaryQuery(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'operator') ?? 'Union';
    const isAll = propBool(node, 'all');

    const opKw =
        op === 'Union'
            ? keyword('UNION', opts)
            : op === 'Intersect'
              ? keyword('INTERSECT', opts)
              : keyword('EXCEPT', opts);

    return [
        left ? printQueryExpression(left, opts, printFn) : '',
        hardline,
        hardline,
        opKw,
        isAll ? [' ', keyword('ALL', opts)] : '',
        hardline,
        hardline,
        right ? printQueryExpression(right, opts, printFn) : '',
    ];
}

export function printOverClause(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    // Named window reference: OVER (w) — SQL Server 2022+
    const windowName = propStr(node, 'windowName');
    if (windowName) return ['(', windowName, ')'];

    const partitions = propArr(node, 'partitionBy');
    const orderBy = prop(node, 'orderBy');
    const frame = prop(node, 'frame');

    const parts: Doc[] = [];

    if (partitions.length > 0) {
        parts.push(
            keyword('PARTITION BY', opts),
            ' ',
            join(
                [',', line],
                partitions.map((p) => printExpression(p, opts, printFn)),
            ),
        );
    }

    if (orderBy) {
        if (parts.length > 0) parts.push(hardline);
        parts.push(printOrderByClause(orderBy, opts, printFn));
    }

    if (frame) {
        if (parts.length > 0) parts.push(hardline);
        parts.push(printWindowFrame(frame, opts, printFn));
    }

    return group(['(', indent([softline, ...parts]), softline, ')']);
}

function printWindowFrame(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const frameType = keyword(propStr(node, 'frameType') ?? 'ROWS', opts); // 'Rows' | 'Range'
    const top = prop(node, 'top');
    const bottom = prop(node, 'bottom');
    if (bottom) {
        return [
            frameType,
            ' ',
            keyword('BETWEEN', opts),
            ' ',
            printWindowDelimiter(top!, opts, printFn),
            ' ',
            keyword('AND', opts),
            ' ',
            printWindowDelimiter(bottom, opts, printFn),
        ];
    }
    return [frameType, ' ', printWindowDelimiter(top!, opts, printFn)];
}

function printWindowDelimiter(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const delimType = propStr(node, 'delimType') ?? '';
    const offset = prop(node, 'offset');
    switch (delimType) {
        case 'UnboundedPreceding':
            return [keyword('UNBOUNDED', opts), ' ', keyword('PRECEDING', opts)];
        case 'ValuePreceding':
            return [offset ? printExpression(offset, opts, printFn) : '', ' ', keyword('PRECEDING', opts)];
        case 'CurrentRow':
            return [keyword('CURRENT', opts), ' ', keyword('ROW', opts)];
        case 'ValueFollowing':
            return [offset ? printExpression(offset, opts, printFn) : '', ' ', keyword('FOLLOWING', opts)];
        case 'UnboundedFollowing':
            return [keyword('UNBOUNDED', opts), ' ', keyword('FOLLOWING', opts)];
        default:
            return delimType;
    }
}

function printWindowDefinition(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const name = propStr(node, 'name') ?? '';
    const refWindowName = propStr(node, 'refWindowName');
    const partitions = propArr(node, 'partitionBy');
    const orderBy = prop(node, 'orderBy');
    const frame = prop(node, 'frame');

    const inner: Doc[] = [];
    if (refWindowName) inner.push(refWindowName);
    if (partitions.length > 0) {
        if (inner.length > 0) inner.push(hardline);
        inner.push(
            keyword('PARTITION BY', opts),
            ' ',
            join(
                [',', line],
                partitions.map((p) => printExpression(p, opts, printFn)),
            ),
        );
    }
    if (orderBy) {
        if (inner.length > 0) inner.push(hardline);
        inner.push(printOrderByClause(orderBy, opts, printFn));
    }
    if (frame) {
        if (inner.length > 0) inner.push(hardline);
        inner.push(printWindowFrame(frame, opts, printFn));
    }

    const body = inner.length > 0 ? group(['(', indent([softline, ...inner]), softline, ')']) : '()';
    return [name, ' ', keyword('AS', opts), ' ', body];
}

export function printWindowClause(defs: SqlNode[], opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    if (defs.length === 0) return '';
    const defDocs = defs.map((d) => printWindowDefinition(d, opts, printFn));
    if (defs.length === 1) {
        return [keyword('WINDOW', opts), ' ', defDocs[0]!];
    }
    return [keyword('WINDOW', opts), indent([hardline, join([',', hardline], defDocs)])];
}

// ---------------------------------------------------------------------------
// Boolean expressions
// ---------------------------------------------------------------------------

export function printBoolExpr(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    switch (node.type) {
        case 'BooleanComparison':
            return printBoolComparison(node, opts, printFn);
        case 'BooleanBinary':
            return printBoolBinary(node, opts, printFn);
        case 'BooleanNot':
            return printBoolNot(node, opts, printFn);
        case 'BooleanParenthesis':
            return printBoolParen(node, opts, printFn);
        case 'IsNullExpression':
            return printIsNull(node, opts, printFn);
        case 'InPredicate':
            return printInPredicate(node, opts, printFn);
        case 'LikePredicate':
            return printLikePredicate(node, opts, printFn);
        case 'ExistsPredicate':
            return printExistsPredicate(node, opts, printFn);
        case 'BetweenExpression':
            return printBetween(node, opts, printFn);
        case 'FullTextPredicate':
            return printFullTextPredicate(node, opts, printFn);
        case 'DistinctPredicate':
            return printDistinctPredicate(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function cmpOp(op: string): string {
    const map: Record<string, string> = {
        Equals: '=',
        NotEqualToBrackets: '<>',
        NotEqualToExclamation: '!=',
        GreaterThan: '>',
        LessThan: '<',
        GreaterThanOrEqualTo: '>=',
        LessThanOrEqualTo: '<=',
        LeftOuterJoin: '*=',
        RightOuterJoin: '=*',
        NotLessThan: '!<',
        NotGreaterThan: '!>',
    };
    return map[op] ?? op;
}

function printBoolComparison(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = cmpOp(propStr(node, 'operator') ?? '=');
    return group([
        left ? printExpression(left, opts, printFn) : '',
        ' ',
        op,
        ' ',
        right ? printExpression(right, opts, printFn) : '',
    ]);
}

function printDistinctPredicate(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const isNot = propBool(node, 'isNot');
    const opKw = isNot ? keyword('IS NOT DISTINCT FROM', opts) : keyword('IS DISTINCT FROM', opts);
    return group([
        left ? printExpression(left, opts, printFn) : '',
        ' ',
        opKw,
        ' ',
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
    const rp = rightmostPred(node);
    const trailing = rp ? rightmostTrailingComment(rp, rp.endOffset) : undefined;
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
    // Use rightmostTrailingComment to also find comments attached to scalar
    // children of the predicate (e.g. the literal in "col = 1") since those
    // share the same endOffset as the predicate itself.
    const rp = rightmostPred(left);
    const betweenComment = rp ? rightmostTrailingComment(rp, rp.endOffset) : undefined;
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
        return [...lhs, ' (', indent([softline, printQueryExpression(subquery, opts, printFn)]), softline, ')'];
    }

    // Value list: all inline when it fits; when it doesn't, each value on its
    // own indented line with ) dropping back to the indentation of the IN line.
    const valueDocs = values.map((v) => printExpression(v, opts, printFn));
    return [...lhs, group([' (', indent([softline, join([',', line], valueDocs)]), softline, ')'])];
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
    return [
        keyword('EXISTS', opts),
        ' (',
        indent([hardline, printQueryExpression(subquery, opts, printFn)]),
        hardline,
        ')',
    ];
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
        case 'NamedTableReference':
            return printNamedTableRef(node, opts);
        case 'VariableTableReference':
            return node.text ?? '/* unknown table var */';
        case 'QualifiedJoin':
            return printQualifiedJoin(node, opts, printFn);
        case 'UnqualifiedJoin':
            return printUnqualifiedJoin(node, opts, printFn);
        case 'JoinParenthesisTableReference':
            return printJoinParenthesis(node, opts, printFn);
        case 'QueryDerivedTable':
            return printQueryDerivedTable(node, opts, printFn);
        case 'SchemaObjectFunctionTableReference':
            return printSchemaObjectFunctionTableRef(node, opts, printFn);
        case 'FullTextTableReference':
            return printFullTextTableRef(node, opts, printFn);
        case 'OpenXmlTableReference':
            return printOpenXmlTableRef(node, opts);
        case 'OpenJsonTableReference':
            return printOpenJsonTableRef(node, opts);
        case 'OpenRowsetTableReference':
            return printOpenRowsetTableRef(node, opts);
        case 'BulkOpenRowset':
            return printBulkOpenRowset(node, opts);
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
        ? [
              ' ',
              keyword('WITH', opts),
              ' (',
              join(
                  ', ',
                  hints.map((h) => keyword(h, opts)),
              ),
              ')',
          ]
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
    const commentLines: Doc[] = betweenComment ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c]) : [];
    const separator: Doc = commentLines.length > 0 ? [...commentLines, hardline] : joinBreak;

    return [
        leftDoc,
        separator,
        joinTypeKeyword(jt, opts),
        ' ',
        right ? printTableRef(right, opts, printFn) : '',
        onDoc,
    ];
}

function printUnqualifiedJoin(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const jt = propStr(node, 'joinType') ?? 'Cross';
    const kw = jt === 'Cross' ? keyword('CROSS JOIN', opts) : keyword('CROSS APPLY', opts);

    const leftDoc = left ? printTableRef(left, opts, printFn) : '';
    // Unqualified joins have no condition; comment lands on left node itself.
    const betweenComment = left ? rightmostTrailingComment(left, left.endOffset) : undefined;
    const commentLines: Doc[] = betweenComment ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c]) : [];
    const separator: Doc = commentLines.length > 0 ? [...commentLines, hardline] : hardline;

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
    const args = propArr(node, 'args');
    const alias = propStr(node, 'alias');
    const argsDoc: Doc = join(
        ', ',
        args.map((a) => printExpression(a, opts, printFn)),
    );
    const aliasDoc: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [schemaObjectName(prop(node, 'name')), '(', argsDoc, ')', aliasDoc];
}

// ---------------------------------------------------------------------------
// Full-text: CONTAINS / FREETEXT predicates and CONTAINSTABLE / FREETEXTTABLE
// ---------------------------------------------------------------------------

/** Render the column-list argument: single column → bare name, multiple → (a, b), wildcard → * */
function fullTextColumnsPart(columns: SqlNode[], printFn: (n: SqlNode) => Doc): Doc {
    if (columns.length === 0) return '*';
    if (columns.length === 1 && columns[0]!.type === 'WildcardColumn') return '*';
    if (columns.length === 1) return printFn(columns[0]!);
    return ['(', join(', ', columns.map(printFn)), ')'];
}

function printFullTextPredicate(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const fnType = propStr(node, 'functionType') ?? 'Contains';
    const fnKw = fnType === 'FreeText' ? keyword('FREETEXT', opts) : keyword('CONTAINS', opts);
    const columns = propArr(node, 'columns');
    const value = prop(node, 'value');
    const language = propStr(node, 'language');

    const args: Doc[] = [
        fullTextColumnsPart(columns, printFn),
        ', ',
        value ? printExpression(value, opts, printFn) : '',
    ];
    if (language) args.push(', ', keyword('LANGUAGE', opts), ' ', language);

    return [fnKw, '(', ...args, ')'];
}

function printFullTextTableRef(node: SqlNode, opts: Options, printFn: (n: SqlNode) => Doc): Doc {
    const fnType = propStr(node, 'functionType') ?? 'Contains';
    const fnKw = fnType === 'FreeText' ? keyword('FREETEXTTABLE', opts) : keyword('CONTAINSTABLE', opts);
    const tableName = prop(node, 'tableName');
    const columns = propArr(node, 'columns');
    const searchCondition = prop(node, 'searchCondition');
    const topN = prop(node, 'topN');
    const language = propStr(node, 'language');
    const alias = propStr(node, 'alias');

    const args: Doc[] = [
        schemaObjectName(tableName),
        ', ',
        fullTextColumnsPart(columns, printFn),
        ', ',
        searchCondition ? printExpression(searchCondition, opts, printFn) : '',
    ];
    if (language) args.push(', ', keyword('LANGUAGE', opts), ' ', language);
    if (topN) args.push(', ', printExpression(topN, opts, printFn));

    const aliasDoc: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [fnKw, '(', ...args, ')', aliasDoc];
}

function rowsetWithClause(items: SqlNode[], opts: Options): Doc {
    return [
        hardline,
        keyword('WITH', opts),
        ' (',
        indent([
            hardline,
            join(
                [',', hardline],
                items.map((i) => i.text ?? ''),
            ),
        ]),
        hardline,
        ')',
    ];
}

function printOpenXmlTableRef(node: SqlNode, opts: Options): Doc {
    const variable = propStr(node, 'variable') ?? '';
    const rowPattern = propStr(node, 'rowPattern');
    const flags = propStr(node, 'flags');
    const withItems = propArr(node, 'withItems');
    const tableName = prop(node, 'tableName');
    const alias = propStr(node, 'alias');

    const args: Doc[] = [variable];
    if (rowPattern) args.push(', ', rowPattern);
    if (flags) args.push(', ', flags);

    const withPart: Doc = withItems.length
        ? rowsetWithClause(withItems, opts)
        : tableName
          ? [hardline, keyword('WITH', opts), ' ', schemaObjectName(tableName)]
          : '';
    const aliasPart: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [keyword('OPENXML', opts), '(', ...args, ')', withPart, aliasPart];
}

function printOpenJsonTableRef(node: SqlNode, opts: Options): Doc {
    const variable = propStr(node, 'variable') ?? '';
    const rowPattern = propStr(node, 'rowPattern');
    const withItems = propArr(node, 'withItems');
    const alias = propStr(node, 'alias');

    const args: Doc[] = [variable];
    if (rowPattern) args.push(', ', rowPattern);

    const withPart: Doc = withItems.length ? rowsetWithClause(withItems, opts) : '';
    const aliasPart: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [keyword('OPENJSON', opts), '(', ...args, ')', withPart, aliasPart];
}

// ---------------------------------------------------------------------------
// OPENROWSET — provider form and BULK form
// ---------------------------------------------------------------------------

function printOpenRowsetTableRef(node: SqlNode, opts: Options): Doc {
    const providerName = propStr(node, 'providerName') ?? '';
    const providerString = propStr(node, 'providerString');
    const dataSource = propStr(node, 'dataSource');
    const userId = propStr(node, 'userId');
    const password = propStr(node, 'password');
    const query = propStr(node, 'query');
    const obj = prop(node, 'object');
    const alias = propStr(node, 'alias');

    // Connection: either a single provider string or three-part datasource;userid;password
    const connection: Doc = providerString
        ? providerString
        : [dataSource ?? '', ';', userId ?? '', ';', password ?? ''];

    // Third argument: either an ad-hoc query string or a remote schema object name
    const third: Doc = query ? query : schemaObjectName(obj);

    const aliasPart: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [keyword('OPENROWSET', opts), '(', providerName, ', ', connection, ', ', third, ')', aliasPart];
}

function printBulkOpenRowset(node: SqlNode, opts: Options): Doc {
    const dataFiles = node.props?.['dataFiles'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const alias = propStr(node, 'alias');

    const dataFile = dataFiles?.[0] ?? '';
    const optionsDocs: Doc = options?.length ? [',', indent([hardline, join([',', hardline], options)])] : '';

    const aliasPart: Doc = alias ? [' ', keyword('AS', opts), ' ', alias] : '';
    return [keyword('OPENROWSET', opts), '(', keyword('BULK', opts), ' ', dataFile, optionsDocs, ')', aliasPart];
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
        return [keyword('ORDER BY', opts), ' ', join(softSep(opts), elDocs)];
    }
    if (density === 'standard' && elements.length === 1) {
        return [keyword('ORDER BY', opts), ' ', elDocs[0]!];
    }
    return [keyword('ORDER BY', opts), indent([hardline, join(hardSep(opts), elDocs)])];
}
