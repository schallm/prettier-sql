import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options, PrintFn } from '@prettier-sql/core/printer/utils';
import {
    keyword,
    getDensity,
    hardline,
    join,
    group,
    indent,
    line,
    softline,
    appendTrailingLines,
    parenList,
    hasLine,
    willBreak,
    parenItems, optionItems,
    aliasDoc,
    commaFill,
    hasLineSuffix,
} from '@prettier-sql/core/printer/utils';
import { caseDoc, betweenDoc, operatorChain, setOpDoc, boolGroup, boolLines, boolClauseDoc, joinOnDoc, parenGroup, selectListDoc, fromClauseDoc, listClauseDoc, clauseItems, windowSpecDoc, windowClauseDoc, subqueryDoc, valuesRow, valuesDoc, type BoolTerm, type CaseResult, type CaseWhen } from '@prettier-sql/core/printer/layout';
import {
    prop, propArr, propStr, propStrArr, propBool, schemaObjectName, builtinTypeDoc, assignmentOp, splitTopLevel, sortOrderDoc,
    claimTrailingComment, isCommentClaimed, takeTrailingComment, withTrailingComment, appendComments,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Module-level lookup tables (created once, not per call)
// ---------------------------------------------------------------------------

const BINARY_OP_MAP: Record<string, string> = {
    Add:        '+',
    Subtract:   '-',
    Multiply:   '*',
    Divide:     '/',
    Modulo:     '%',
    BitwiseAnd: '&',
    BitwiseOr:  '|',
    BitwiseXor: '^',
    LeftShift:  '<<',
    RightShift: '>>',
    Concatenate: '+',
    Concat:     '||',
};

const CMP_OP_MAP: Record<string, string> = {
    Equals:                 '=',
    NotEqualToBrackets:     '<>',
    NotEqualToExclamation:  '!=',
    GreaterThan:            '>',
    LessThan:               '<',
    GreaterThanOrEqualTo:   '>=',
    LessThanOrEqualTo:      '<=',
    LeftOuterJoin:          '*=',
    RightOuterJoin:         '=*',
    NotLessThan:            '!<',
    NotGreaterThan:         '!>',
};

const JOIN_TYPE_MAP: Record<string, string> = {
    Inner:      'INNER JOIN',
    LeftOuter:  'LEFT JOIN',
    RightOuter: 'RIGHT JOIN',
    FullOuter:  'FULL JOIN',
};

const JOIN_TYPE_WORD: Record<string, string> = {
    Inner:      'INNER',
    LeftOuter:  'LEFT',
    RightOuter: 'RIGHT',
    FullOuter:  'FULL',
};

// ---------------------------------------------------------------------------
// Scalar expressions
// ---------------------------------------------------------------------------

export function printExpression(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    return withTrailingComment(node, printExpressionInner(node, opts, printFn));
}

function printExpressionInner(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    switch (node.type) {
        case 'WildcardColumn':
            return '*';
        case 'ColumnReference':
            return printColumnRef(node);
        case 'CollateExpression': {
            const colExpr = prop(node, 'expression');
            const collation = propStr(node, 'collation') ?? '';
            return [colExpr ? printFn(colExpr) : '', ' ', keyword('COLLATE', opts), ' ', collation];
        }
        case 'IntegerLiteral':
            return node.text ?? '0';
        case 'NumericLiteral':
            return node.text ?? '0';
        case 'RealLiteral':
            return node.text ?? '0';
        case 'MoneyLiteral':
            return node.text ?? '0';
        case 'StringLiteral': {
            // ScriptDom Value is unescaped content; re-escape embedded single quotes
            const strContent = (node.text ?? '').replaceAll("'", "''");
            return node.props?.['isNational'] ? `N'${strContent}'` : `'${strContent}'`;
        }
        case 'BinaryLiteral':
            // ScriptDom BinaryLiteral.Value includes the '0x' prefix already
            return node.text ?? '0x0';
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
        case 'OdbcFunctionCall':
            return [
                '{', keyword('fn', opts), ' ', keyword(propStr(node, 'name') ?? '', opts),
                '(', join(', ', propArr(node, 'args').map((a) => printExpression(a, opts, printFn))), ')}',
            ];
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
        case 'NextValueFor':
            return printNextValueFor(node, opts, printFn);
        case 'ParseCall':
        case 'TryParseCall':
            return printParseCall(node, opts, printFn);
        case 'ParameterlessCall':
            return keyword(node.text ?? 'CURRENT_TIMESTAMP', opts);
        case 'DefaultLiteral':
            return keyword('DEFAULT', opts);
        case 'PartitionFunctionCall':
            return printPartitionFunctionCall(node, opts, printFn);
        case 'IdentityFunctionCall':
            return printIdentityFunctionCall(node, opts, printFn);
        case 'ExtractFromExpression':
            return printExtractFrom(node, opts, printFn);
        case 'OverClause':
            return printOverClause(node, opts, printFn);
        case 'DistributedAggSpec': {
            const expr = prop(node, 'expression');
            return [expr ? printExpression(expr, opts, printFn) : '', ' ', keyword('WITH', opts), ' (', keyword('DISTRIBUTED_AGG', opts), ')'];
        }
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

function printSelectScalar(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expression');
    const alias = propStr(node, 'alias');
    if (alias) {
        const aliasPart: Doc = [' ', keyword('AS', opts), ' ', alias];
        // A chain takes the alias into its last piece so its line-filling counts it. (Printing
        // claims the expression's comments, so the expression is printed once, one way or the other.)
        const chainDoc = expr ? printChainWithTail(expr, aliasPart, opts, printFn) : null;
        return chainDoc ?? [expr ? printExpression(expr, opts, printFn) : '', aliasPart];
    }
    return expr ? printExpression(expr, opts, printFn) : '';
}

function printSelectSetVariable(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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

function printJsonKeyValue(kv: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const keyNode = prop(kv, 'key');
    const valNode = prop(kv, 'value');
    const keyDoc = keyNode ? printExpression(keyNode, opts, printFn) : '';
    const valDoc = valNode ? printExpression(valNode, opts, printFn) : '';
    return [keyDoc, ': ', valDoc];
}

function printFunctionCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const name = propStr(node, 'name') ?? 'FUNC';
    const args = propArr(node, 'args').map((a) => printExpression(a, opts, printFn));
    const over = prop(node, 'over');
    const uniqueRowFilter = propStr(node, 'uniqueRowFilter');
    const distinctDoc = uniqueRowFilter === 'Distinct' ? [keyword('DISTINCT', opts), ' '] : [];
    // [ABSENT ON NULL | NULL ON NULL] [WITH ARRAY WRAPPER] [RETURNING type], last inside the parentheses
    const nullOnNullDoc = printNullOnNullClause(node, opts);
    const returnType = propStr(node, 'returnType');
    const tailClauses: Doc[] = [];
    if (nullOnNullDoc) tailClauses.push(nullOnNullDoc);
    if (propBool(node, 'withArrayWrapper')) tailClauses.push(keyword('WITH ARRAY WRAPPER', opts));
    if (returnType) {
        tailClauses.push([keyword('RETURNING', opts), ' ', propBool(node, 'returnIsUdt') ? returnType : builtinTypeDoc(returnType, opts)]);
    }
    const tailDoc: Doc = tailClauses.map((c) => [' ', c]);

    // TRIM([LEADING|TRAILING|BOTH] [chars] FROM str) — SQL Server 2022+
    // ScriptDOM always uses FROM syntax when TRIM has 2 params, with or without a direction keyword.
    const trimOptions = propStr(node, 'trimOptions');
    if (name.toUpperCase() === 'TRIM' && (trimOptions || args.length === 2)) {
        if (trimOptions) {
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
        } else if (args.length === 2) {
            return group([
                keyword('TRIM', opts),
                '(',
                indent([softline, args[0]!, ' ', keyword('FROM', opts), line, args[1]!]),
                softline,
                ')',
            ]);
        }
    }

    // JSON_OBJECT('key': value [, ...] [ABSENT ON NULL | NULL ON NULL]) — SQL Server 2022+
    const jsonParams = propArr(node, 'jsonParams');
    if (jsonParams.length > 0) {
        const pairs = jsonParams.map((kv) => printJsonKeyValue(kv, opts, printFn));
        return group([
            keyword(name, opts),
            '(',
            indent([softline, join([',', line], pairs), tailDoc]),
            softline,
            ')',
        ]);
    }

    // JSON_ARRAYAGG(expr [ORDER BY ...] [ABSENT ON NULL | NULL ON NULL]) — SQL Server 2022+
    const jsonOrderBy = prop(node, 'jsonOrderBy');
    if (jsonOrderBy && name.toUpperCase() === 'JSON_ARRAYAGG') {
        const orderByDoc = [keyword('ORDER BY', opts), ' ', join(', ', orderByItems(jsonOrderBy, opts, printFn))];
        return group([
            keyword(name, opts),
            '(',
            indent([softline, join([',', line], args), ' ', orderByDoc, tailDoc]),
            softline,
            ')',
        ]);
    }

    // Standard function call (JSON_ARRAY and others with optional ABSENT/NULL ON NULL)
    const callTarget = propStr(node, 'callTarget');
    const callTargetExprNode = prop(node, 'callTargetExpr');
    const callTargetSep = (node.props?.['callTargetSeparator'] as string) ?? '::';
    const callTargetPrefix: Doc = callTargetExprNode
        ? [printFn(callTargetExprNode), callTargetSep]
        : callTarget
          ? [callTarget, callTargetSep]
          : '';
    // compact: fill-pack args — as many per line as fit, wrap only when required
    // standard/spacious: all-or-nothing group (all inline or each on its own line)
    const argsListDoc: Doc =
        getDensity(opts) === 'compact' && args.length > 1
            ? commaFill(args)
            : join([',', line], args);
    // Only an unqualified call is a built-in (scalar UDFs and CLR aggregates must be
    // schema-qualified), so only it gets keyword casing. Anything with a call target keeps
    // its name as written: CLR/xml methods (h.GetAncestor, x.value) are case-sensitive.
    const nameDoc: Doc = callTargetPrefix ? name : keyword(name, opts);
    const hasArgs = args.length > 0 || distinctDoc.length > 0 || tailClauses.length > 0;
    const argsDoc = group([
        callTargetPrefix,
        nameDoc,
        '(',
        // f(): nothing to wrap, so no line breaks inside the parentheses
        hasArgs ? [indent([softline, ...distinctDoc, argsListDoc, tailDoc]), softline] : '',
        ')',
    ]);

    // IGNORE NULLS / RESPECT NULLS modifier — SQL Server 2022+
    const nullsModifier = propStr(node, 'nulls');
    const nullsDoc: Doc = nullsModifier ? [' ', keyword(nullsModifier.toUpperCase(), opts)] : '';

    // WITHIN GROUP (ORDER BY ...) for STRING_AGG, PERCENTILE_CONT/DISC etc.;
    // WITHIN GROUP (GRAPH PATH) for an aggregate over a SHORTEST_PATH
    const withinGroup = prop(node, 'withinGroup');
    const graphPath = propBool(node, 'withinGroupGraphPath');
    if (withinGroup || graphPath) {
        const withinDoc: Doc = [
            ' ',
            keyword('WITHIN GROUP', opts),
            ' (',
            withinGroup
                ? [keyword('ORDER BY', opts), ' ', join(', ', orderByItems(withinGroup, opts, printFn))]
                : keyword('GRAPH PATH', opts),
            ')',
        ];
        if (over)
            return [
                argsDoc,
                nullsDoc,
                withinDoc,
                ' ',
                keyword('OVER', opts),
                ' ',
                printOverClause(over, opts, printFn),
            ];
        return [argsDoc, nullsDoc, withinDoc];
    }

    if (over) {
        return [argsDoc, nullsDoc, ' ', keyword('OVER', opts), ' ', printOverClause(over, opts, printFn)];
    }
    return argsDoc;
}

// Flatten a left-recursive chain of the given operators into its terms, each paired with
// the operator that precedes it. Stops at any other operator so e.g. the `a * b` in
// `a * b + c` stays grouped. Keeping + - and || chains separate prevents mixing them.
function collectBinaryChain(node: SqlNode, ops: Set<string>): { op: string; term: SqlNode }[] {
    const op = propStr(node, 'operator');
    if (node.type !== 'BinaryExpression' || !ops.has(op ?? '')) {
        return [{ op: '', term: node }];
    }
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    return [...(left ? collectBinaryChain(left, ops) : []), ...(right ? [{ op: mapBinaryOp(op!), term: right }] : [])];
}

const ADDITIVE_OPS = new Set(['Add', 'Subtract', 'Concatenate']);
const CONCAT_OPS = new Set(['Concat']);

/**
 * A + - || chain with `tail` (a select item's ` AS alias`) taken into its last piece, so the
 * line-filling counts it; null when `node` isn't a chain.
 */
function printChainWithTail(node: SqlNode, tail: Doc, opts: Options, printFn: PrintFn): Doc | null {
    const op = propStr(node, 'operator') ?? '';
    const chainOps = node.type === 'BinaryExpression' ? (ADDITIVE_OPS.has(op) ? ADDITIVE_OPS : CONCAT_OPS.has(op) ? CONCAT_OPS : null) : null;
    if (!chainOps) return null;
    const terms = collectBinaryChain(node, chainOps).map((t) => ({ op: t.op, term: printExpression(t.term, opts, printFn) }));
    return withTrailingComment(node, operatorChain(terms, tail));
}

function printBinaryExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const op = propStr(node, 'operator') ?? '+';

    const chainOps = ADDITIVE_OPS.has(op) ? ADDITIVE_OPS : CONCAT_OPS.has(op) ? CONCAT_OPS : null;
    if (chainOps) {
        return operatorChain(collectBinaryChain(node, chainOps).map((t) => ({ op: t.op, term: printExpression(t.term, opts, printFn) })));
    }

    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const opStr = mapBinaryOp(op);
    return operatorDoc(
        left ? printExpression(left, opts, printFn) : '',
        opStr,
        right ? printExpression(right, opts, printFn) : '',
    );
}

/**
 * `left op right`: when it doesn't fit and both operands are plain (nothing in them can
 * break), the right one moves to an indented line of its own after the operator. An
 * operand that can break itself (a call, a subquery, a wrapped chain) keeps the line.
 */
function operatorDoc(left: Doc, op: Doc, right: Doc): Doc {
    if (hasLine(left) || hasLine(right)) return group([left, ' ', op, ' ', right]);
    return group([left, ' ', op, indent([line, right])]);
}

function mapBinaryOp(op: string): string {
    return BINARY_OP_MAP[op] ?? op;
}

function printUnaryExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const op = propStr(node, 'operator') ?? '-';
    const opStr = op === 'Positive' ? '+' : op === 'Negative' ? '-' : op === 'BitwiseNot' ? '~' : op;
    // - -a: written together, the two minus signs would start a -- comment
    const nestedMinus = opStr === '-' && expr?.type === 'UnaryExpression' && propStr(expr, 'operator') === 'Negative';
    return [opStr, nestedMinus ? ' ' : '', expr ? printExpression(expr, opts, printFn) : ''];
}

function printParenExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    return ['(', expr ? printExpression(expr, opts, printFn) : '', ')'];
}

function printCaseExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const caseType = propStr(node, 'caseType');
    const whens = propArr(node, 'whens');
    const elseExpr = prop(node, 'else');
    const input = prop(node, 'input');

    const isSearched = caseType === 'searched';
    const result = (expr: SqlNode | null): CaseResult => ({
        doc: expr ? printExpression(expr, opts, printFn) : keyword('NULL', opts),
        nested: expr?.type === 'CaseExpression',
    });
    const whenDocs = whens.map((w): CaseWhen => {
        const whenExpr = prop(w, 'when');
        const whenPart = !whenExpr ? keyword('NULL', opts)
            : isSearched ? printBoolExpr(whenExpr, opts, printFn)
            : printExpression(whenExpr, opts, printFn);
        return { when: whenPart, then: result(prop(w, 'then')), boolChain: whenExpr?.type === 'BooleanBinary' };
    });
    return caseDoc(input ? printExpression(input, opts, printFn) : null, whenDocs, elseExpr ? result(elseExpr) : null, opts);
}

/** A data type: a keyword, unless it names a user-defined type (an identifier, whose case is kept). */
function typeDoc(node: SqlNode, dataType: string, opts: Options): Doc {
    return node.props?.['isUdt'] ? dataType : builtinTypeDoc(dataType, opts);
}

/** CAST(expr AS type): the whole argument moves to an indented line when it doesn't fit; one that spans lines hugs the parentheses. */
function castDoc(name: Doc, expr: Doc, type: Doc, opts: Options): Doc {
    const arg: Doc = [expr, ' ', keyword('AS', opts), ' ', type];
    if (willBreak(expr)) return [name, '(', arg, ')'];
    return [name, group(['(', indent([softline, arg]), softline, ')'])];
}

function printCastCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    return castDoc(keyword('CAST', opts), expr ? printExpression(expr, opts, printFn) : '', typeDoc(node, dataType, opts), opts);
}

function printConvertCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const style = prop(node, 'style');
    const items: Doc[] = [typeDoc(node, dataType, opts), expr ? printExpression(expr, opts, printFn) : ''];
    if (style) items.push(printExpression(style, opts, printFn));
    return [keyword('CONVERT', opts), parenItems(items, opts)];
}

function printIIfCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const condition = prop(node, 'condition');
    const trueVal = prop(node, 'trueVal');
    const falseVal = prop(node, 'falseVal');
    return [
        keyword('IIF', opts),
        parenItems(
            [
                condition ? printBoolExpr(condition, opts, printFn) : '',
                trueVal ? printExpression(trueVal, opts, printFn) : '',
                falseVal ? printExpression(falseVal, opts, printFn) : '',
            ],
            opts,
        ),
    ];
}

function printCoalesceExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const args = propArr(node, 'args');
    return [
        keyword('COALESCE', opts),
        parenItems(
            args.map((a) => printExpression(a, opts, printFn)),
            opts,
        ),
    ];
}

function printNullIfExpr(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const first = prop(node, 'first');
    const second = prop(node, 'second');
    return [
        keyword('NULLIF', opts),
        parenItems([first ? printExpression(first, opts, printFn) : '', second ? printExpression(second, opts, printFn) : ''], opts),
    ];
}

function printTryCastCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    return castDoc(keyword('TRY_CAST', opts), expr ? printExpression(expr, opts, printFn) : '', typeDoc(node, dataType, opts), opts);
}

function printTryConvertCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const dataType = propStr(node, 'dataType') ?? 'INT';
    const style = prop(node, 'style');
    const items: Doc[] = [typeDoc(node, dataType, opts), expr ? printExpression(expr, opts, printFn) : ''];
    if (style) items.push(printExpression(style, opts, printFn));
    return [keyword('TRY_CONVERT', opts), parenItems(items, opts)];
}

function printAtTimeZone(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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

function printScalarSubquery(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const query = prop(node, 'query');
    if (!query) return '(/* subquery */)';
    return subqueryDoc(printQueryExpression(query, opts, printFn), opts);
}

// ---------------------------------------------------------------------------
// Query expressions (SELECT, UNION, etc.) — kept here to avoid circular imports
// with statements.ts which handles top-level statement formatting.
// ---------------------------------------------------------------------------

export function printQueryExpression(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    return withTrailingComment(node, printQueryExpressionInner(node, opts, printFn));
}

function printQueryExpressionInner(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    switch (node.type) {
        case 'QuerySpecification':
            return printQuerySpec(node, opts, printFn);
        case 'BinaryQueryExpression':
            return printBinaryQuery(node, opts, printFn);
        case 'QueryParenthesis': {
            const q = prop(node, 'query');
            if (!q) return '()';
            const sep = getDensity(opts) === 'compact' ? softline : hardline;
            return group(['(', indent([sep, printQueryExpression(q, opts, printFn)]), sep, ')']);
        }
        case 'QueryDerivedTable': {
            const q = prop(node, 'query');
            const inner = q ? printQueryExpression(q, opts, printFn) : '/* query */';
            const sep = getDensity(opts) === 'compact' ? softline : hardline;
            return group(['(', indent([sep, inner]), sep, ')', tableAliasDoc(node, opts)]);
        }
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function printQuerySpec(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const density = getDensity(opts);
    const compact = density === 'compact';
    const sep: Doc = compact ? line : hardline;

    const uniqueRowFilter = propStr(node, 'uniqueRowFilter');
    const top = prop(node, 'top');
    const selectElements = propArr(node, 'selectElements');
    const forClause = prop(node, 'forClause');
    const from = prop(node, 'from');
    const where = prop(node, 'where');
    const groupBy = prop(node, 'groupBy');
    const having = prop(node, 'having');
    const orderBy = prop(node, 'orderBy');
    const windowDefs = propArr(node, 'windowDefs');
    // SELECT INTO target — injected by BuildSelectStatement into the QuerySpecification node
    const intoTarget = prop(node, 'into');
    const intoOn = propStr(node, 'intoOn');
    const intoOnDoc: Doc = intoOn ? [' ', keyword('ON', opts), ' ', intoOn] : '';

    const selectKw = uniqueRowFilter === 'Distinct' ? keyword('SELECT DISTINCT', opts) : keyword('SELECT', opts);
    const topDoc = top ? printTop(top, opts, printFn) : null;
    const colDocs = selectElements.map((se) => printExpression(se, opts, printFn));

    // A CASE spans lines, so it starts on a line of its own even as the only column
    const caseOnly = selectElements.length === 1 && (prop(selectElements[0]!, 'expression') ?? selectElements[0]!).type === 'CaseExpression';
    const parts: Doc[] = [selectListDoc([selectKw, topDoc ? [' ', topDoc] : ''], colDocs, opts, caseOnly)];

    // SELECT INTO target appears after the column list and before the FROM clause
    if (intoTarget) parts.push(sep, keyword('INTO', opts), ' ', schemaObjectName(intoTarget), intoOnDoc);

    if (from) parts.push(sep, printFromClause(from, opts, printFn));

    if (where) parts.push(sep, boolClause('WHERE', where, opts, printFn));

    if (groupBy) {
        const elemDocs = propArr(groupBy, 'elements').map((e) => printExpression(e, opts, printFn));
        parts.push(sep, listClauseDoc(groupByKeyword(groupBy, opts), elemDocs, opts), groupByWithOption(groupBy, opts));
    }

    if (having) parts.push(sep, boolClause('HAVING', having, opts, printFn));

    // WINDOW comes before ORDER BY: SELECT ... HAVING ... WINDOW w AS (...) ORDER BY ...
    if (windowDefs.length > 0) parts.push(sep, printWindowClause(windowDefs, opts, printFn));

    if (orderBy) parts.push(sep, printOrderByClause(orderBy, opts, printFn));

    parts.push(...offsetFetch(node, sep, opts, printFn));

    if (forClause) parts.push(sep, printForClause(forClause, opts));

    return group(parts);
}

/** `FROM` and its table references (a FromClause node). */
export function printFromClause(from: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const tableRefs = propArr(from, 'tableReferences');
    const hasJoin = tableRefs.some((tr) => tr.type === 'QualifiedJoin' || tr.type === 'UnqualifiedJoin');
    return fromClauseDoc(keyword('FROM', opts), tableRefs.map((tr) => printTableRef(tr, opts, printFn)), hasJoin, opts);
}

export function printTop(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expression');
    const isPercent = propBool(node, 'percent');
    const withTies = propBool(node, 'withTies');
    const parts: Doc[] = [keyword('TOP', opts), ' (', expr ? printExpression(expr, opts, printFn) : '', ')'];
    if (isPercent) parts.push(' ', keyword('PERCENT', opts));
    if (withTies) parts.push(' ', keyword('WITH TIES', opts));
    if (propBool(node, 'withApproximate')) parts.push(' ', keyword('WITH APPROXIMATE', opts));
    return parts;
}

function printGroupingSet(kw: string, node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const exprs = propArr(node, 'expressions').map((e) => printExpression(e, opts, printFn));
    return group([keyword(kw, opts), '(', indent([softline, join([',', line], exprs)]), softline, ')']);
}

function printGroupingSets(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const sets = propArr(node, 'sets').map((s) => printExpression(s, opts, printFn));
    return group([keyword('GROUPING SETS', opts), '(', indent([softline, join([',', line], sets)]), softline, ')']);
}

function printCompositeGroup(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const items = propArr(node, 'items').map((e) => printExpression(e, opts, printFn));
    return parenList(items);
}

function printBinaryQuery(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = propStr(node, 'operator') ?? 'Union';
    const isAll = propBool(node, 'all');
    const orderBy = prop(node, 'orderBy');

    const opKw =
        op === 'Union'
            ? keyword('UNION', opts)
            : op === 'Intersect'
              ? keyword('INTERSECT', opts)
              : keyword('EXCEPT', opts);

    const parts: Doc[] = [
        setOpDoc(
            left ? printQueryExpression(left, opts, printFn) : '',
            [opKw, isAll ? [' ', keyword('ALL', opts)] : ''],
            right ? printQueryExpression(right, opts, printFn) : '',
        ),
    ];

    if (orderBy) parts.push(hardline, printOrderByClause(orderBy, opts, printFn));
    parts.push(...offsetFetch(node, hardline, opts, printFn));
    return parts;
}

/** `OFFSET n ROWS` and `FETCH NEXT n ROWS ONLY`, each after `sep`, at the end of a query. */
function offsetFetch(node: SqlNode, sep: Doc, opts: Options, printFn: PrintFn): Doc[] {
    const offset = prop(node, 'offset');
    const fetch = prop(node, 'fetch');
    const parts: Doc[] = [];
    if (offset) parts.push(sep, keyword('OFFSET', opts), ' ', printExpression(offset, opts, printFn), ' ', keyword('ROWS', opts));
    // FETCH without OFFSET: ORDER BY ... FETCH [APPROXIMATE] NEXT n ROWS ONLY
    if (fetch) {
        const fetchKw = propBool(node, 'fetchApproximate') ? 'FETCH APPROXIMATE NEXT' : 'FETCH NEXT';
        parts.push(sep, keyword(fetchKw, opts), ' ', printExpression(fetch, opts, printFn), ' ', keyword('ROWS ONLY', opts));
    }
    return parts;
}

export function printOverClause(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    // Named window reference: OVER w — SQL Server 2022+ (no parens around the name).
    // A window that builds on it, OVER (w ROWS ...), keeps the name inside the parens.
    const windowName = propStr(node, 'windowName');
    const clauses = windowClauses(node, opts, printFn);
    if (windowName && clauses.length === 0) return windowName;

    return windowSpecDoc(windowName ? [windowName, ...clauses] : clauses);
}

/** The clauses of a window specification: [base window] [PARTITION BY …] [ORDER BY …] [frame]. */
function windowClauses(node: SqlNode, opts: Options, printFn: PrintFn): Doc[] {
    const refWindowName = propStr(node, 'refWindowName');
    const partitions = propArr(node, 'partitionBy');
    const orderBy = prop(node, 'orderBy');
    const frame = prop(node, 'frame');
    const clauses: Doc[] = [];
    if (refWindowName) clauses.push(refWindowName);
    if (partitions.length > 0) {
        clauses.push([keyword('PARTITION BY', opts), ' ', clauseItems(partitions.map((p) => printExpression(p, opts, printFn)))]);
    }
    if (orderBy) clauses.push([keyword('ORDER BY', opts), ' ', clauseItems(orderByItems(orderBy, opts, printFn))]);
    if (frame) clauses.push(printWindowFrame(frame, opts, printFn));
    return clauses;
}

function printWindowFrame(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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

function printWindowDelimiter(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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

function printWindowDefinition(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const name = propStr(node, 'name') ?? '';
    return [name, ' ', keyword('AS', opts), ' ', windowSpecDoc(windowClauses(node, opts, printFn))];
}

export function printWindowClause(defs: SqlNode[], opts: Options, printFn: PrintFn): Doc {
    if (defs.length === 0) return '';
    return windowClauseDoc(keyword('WINDOW', opts), defs.map((d) => printWindowDefinition(d, opts, printFn)), opts);
}

// ---------------------------------------------------------------------------
// Boolean expressions
// ---------------------------------------------------------------------------

/**
 * A predicate. An AND / OR chain is `grouped` (on one line when it fits) when it is an
 * operand — inside parentheses, or under an operator it binds tighter than — and
 * otherwise one predicate to a line.
 */
export function printBoolExpr(node: SqlNode, opts: Options, printFn: PrintFn, grouped = false): Doc {
    // Claim the comments this predicate tree prints between predicates, before any part prints
    claimPredicateComments(node);
    return withTrailingComment(node, printBoolExprInner(node, opts, printFn, grouped));
}

function printBoolExprInner(node: SqlNode, opts: Options, printFn: PrintFn, grouped: boolean): Doc {
    switch (node.type) {
        // UPDATE / DELETE ... WHERE CURRENT OF [GLOBAL] cursor
        case 'CurrentOfCursor':
            return [
                keyword('CURRENT OF', opts),
                propBool(node, 'global') ? [' ', keyword('GLOBAL', opts)] : '',
                ' ', propStr(node, 'name') ?? '',
            ];
        case 'BooleanComparison':
            return printBoolComparison(node, opts, printFn);
        case 'BooleanBinary':
            return printBoolBinary(node, opts, printFn, grouped);
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
        case 'SubqueryComparisonPredicate':
            return printSubqueryComparison(node, opts, printFn);
        case 'RegexpLikePredicate':
            return printRegexpLikePredicate(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

function cmpOp(op: string): string {
    return CMP_OP_MAP[op] ?? op;
}

function printBoolComparison(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const op = cmpOp(propStr(node, 'operator') ?? '=');
    return operatorDoc(
        left ? printExpression(left, opts, printFn) : '',
        op,
        right ? printExpression(right, opts, printFn) : '',
    );
}

function printDistinctPredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const isNot = propBool(node, 'isNot');
    const opKw = isNot ? keyword('IS NOT DISTINCT FROM', opts) : keyword('IS DISTINCT FROM', opts);
    return operatorDoc(
        left ? printExpression(left, opts, printFn) : '',
        opKw,
        right ? printExpression(right, opts, printFn) : '',
    );
}

function printSubqueryComparison(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const op = cmpOp(propStr(node, 'operator') ?? '');
    const quantifier = propStr(node, 'quantifier'); // ALL, ANY, or null
    const subquery = prop(node, 'subquery');
    const subDoc = subquery ? subqueryDoc(printQueryExpression(subquery, opts, printFn), opts) : '';
    return group([
        expr ? printExpression(expr, opts, printFn) : '',
        ' ',
        op,
        quantifier ? [' ', keyword(quantifier, opts)] : '',
        ' ',
        subDoc,
    ]);
}

// Walk to the rightmost non-BooleanBinary leaf of a boolean subtree.
export function rightmostPred(node: SqlNode | null | undefined): SqlNode | null {
    if (!node) return null;
    if (node.type === 'BooleanBinary') return rightmostPred(prop(node, 'right'));
    return node;
}

// Append any trailing comment on the rightmost predicate leaf to the doc.
export function boolWithTrailing(node: SqlNode, doc: Doc): Doc {
    const rp = rightmostPred(node);
    const trailing = rp ? rightmostTrailingComment(rp, rp.endOffset) : undefined;
    return appendTrailingLines(doc, trailing);
}

/**
 * Peek whether printBool(node, opts) is about to emit a trailing comment of its own,
 * appended on a new line after the predicate — without claiming/consuming it (safe to
 * call before printBool). boolWithTrailing's appended line has nothing to end it, so a
 * caller that prints more tokens right after printBool() on what would otherwise be the
 * same line (a closing paren on a CHECK constraint, THEN in a MERGE clause) needs to
 * force its own break first, or those tokens land inside the comment.
 */
export function boolEndsWithPendingComment(node: SqlNode): boolean {
    const rp = rightmostPred(node);
    const found = rp ? rightmostCommentNode(rp, rp.endOffset) : undefined;
    return found?.trailingComment !== undefined;
}

const boolOp = (node: SqlNode): 'AND' | 'OR' => (propStr(node, 'operator') === 'Or' ? 'OR' : 'AND');

/**
 * The predicates of an AND / OR chain — or the one predicate of anything else. The parser
 * nests a chain to the left, so `a AND b AND c` flattens to three predicates; an operand
 * with the other operator (`a OR b AND c`) binds tighter and stays one predicate, grouped.
 */
function boolTerms(node: SqlNode, opts: Options, printFn: PrintFn): BoolTerm[] {
    if (node.type !== 'BooleanBinary') return [{ op: 'AND', doc: printBoolExpr(node, opts, printFn) }];
    const op = boolOp(node);
    // Each predicate, with the chain node it ends (whose own comment follows it)
    const preds: { pred: SqlNode; chain?: SqlNode }[] = [];
    for (let n: SqlNode | null = node; n; n = prop(n, 'left')) {
        if (n.type !== 'BooleanBinary' || boolOp(n) !== op) {
            preds.unshift({ pred: n });
            break;
        }
        const right = prop(n, 'right');
        if (right) preds.unshift({ pred: right, chain: n === node ? undefined : n });
    }
    const terms: BoolTerm[] = [];
    for (const { pred, chain } of preds) {
        const doc = printBoolExpr(pred, opts, printFn, true);
        const term: BoolTerm = { op, doc: chain ? withTrailingComment(chain, doc) : doc };
        // A comment on the previous predicate's rightmost leaf sits between the two
        // predicates in the source — typically a commented-out `--and x = 1`. It goes on
        // lines of its own after that predicate. rightmostTrailingComment also finds a
        // comment attached to a scalar child of the predicate (the literal in "col = 1"),
        // which shares the predicate's endOffset.
        const prev = terms[terms.length - 1];
        const rp = prev ? rightmostPred(preds[terms.length - 1]!.pred) : null;
        const between = rp ? rightmostTrailingComment(rp, rp.endOffset) : undefined;
        if (prev && between) {
            prev.doc = [prev.doc, ...between.split('\n').flatMap((c): Doc[] => [hardline, c])];
            term.breakBefore = true;
        }
        terms.push(term);
    }
    return terms;
}

function printBoolBinary(node: SqlNode, opts: Options, printFn: PrintFn, grouped: boolean): Doc {
    const terms = boolTerms(node, opts, printFn);
    // compact density keeps even a top-level chain on one line when it fits
    return grouped || getDensity(opts) === 'compact' ? boolGroup(terms, opts) : boolLines(terms, opts);
}

/**
 * `WHERE` / `HAVING` (or another keyword) and its predicates, with any comment after the
 * last predicate on lines of its own.
 */
export function boolClause(kw: string, node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    claimPredicateComments(node);
    const terms = boolTerms(node, opts, printFn);
    const last = terms[terms.length - 1]!;
    // A comment attached to the chain itself, then one on its last predicate
    if (terms.length > 1) last.doc = withTrailingComment(node, last.doc);
    last.doc = boolWithTrailing(node, last.doc);
    return boolClauseDoc(kw, terms, opts);
}

// Predicates that read as `operand operator operand`
const OPERATOR_PREDICATES = new Set([
    'BooleanComparison', 'IsNullExpression', 'LikePredicate', 'InPredicate', 'BetweenExpression',
    'DistinctPredicate', 'SubqueryComparisonPredicate',
]);

function printBoolNot(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const exprDoc = expr ? printBoolExpr(expr, opts, printFn, true) : '';
    // A comparison under NOT gets parentheses it doesn't need, for readability: NOT (a = 1)
    return [keyword('NOT', opts), ' ', expr && OPERATOR_PREDICATES.has(expr.type) ? parenGroup(exprDoc) : exprDoc];
}

function printBoolParen(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    if (!expr) return '()';
    return parenGroup(printBoolExpr(expr, opts, printFn, true));
}

function printIsNull(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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

// Literals are short enough to pack several to a line in a long list.
const LITERAL_TYPES = new Set(['IntegerLiteral', 'NumericLiteral', 'RealLiteral', 'MoneyLiteral', 'StringLiteral', 'BinaryLiteral', 'NullLiteral']);

function printInPredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
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
        return [...lhs, ' ', subqueryDoc(printQueryExpression(subquery, opts, printFn), opts)];
    }

    // Value list: all inline when it fits; when it doesn't, each value on its
    // own indented line with ) dropping back to the indentation of the IN line.
    const valueDocs = values.map((v) => printExpression(v, opts, printFn));
    const literals = values.every((v) => LITERAL_TYPES.has(v.type));
    return [...lhs, ' ', parenItems(valueDocs, opts, literals)];
}

function printRegexpLikePredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const args: Doc[] = [
        prop(node, 'value') ? printExpression(prop(node, 'value')!, opts, printFn) : '',
        prop(node, 'pattern') ? printExpression(prop(node, 'pattern')!, opts, printFn) : '',
    ];
    const flags = prop(node, 'flags');
    if (flags) args.push(printExpression(flags, opts, printFn));
    return [keyword('regexp_like', opts), parenList(args)];
}

function printLikePredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const pattern = prop(node, 'pattern');
    const isNot = propBool(node, 'negated');
    const escape = prop(node, 'escape');

    const base = operatorDoc(
        expr ? printExpression(expr, opts, printFn) : '',
        [isNot ? [keyword('NOT', opts), ' '] : '', keyword('LIKE', opts)],
        pattern ? printExpression(pattern, opts, printFn) : '',
    );
    return escape ? [base, ' ', keyword('ESCAPE', opts), ' ', printExpression(escape, opts, printFn)] : base;
}

function printExistsPredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const subquery = prop(node, 'subquery');
    if (!subquery) return keyword('EXISTS', opts) + '()';
    const density = getDensity(opts);
    if (density !== 'compact') {
        // standard + spacious: the subquery goes on its own lines, formatted like any other SELECT
        return group([
            keyword('EXISTS', opts),
            ' (',
            indent([hardline, printQueryExpression(subquery, opts, printFn)]),
            hardline,
            ')',
        ]);
    }
    // compact: render the inner query in compact mode so the group's
    // softline can keep simple subqueries inline. Complex ones still wrap because
    // their content exceeds printWidth and the group breaks.
    const compactOpts = { ...opts, sqlDensity: 'compact' } as Options;
    return group([
        keyword('EXISTS', opts),
        ' (',
        indent([softline, printQueryExpression(subquery, compactOpts, printFn)]),
        softline,
        ')',
    ]);
}

function printBetween(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const expr = prop(node, 'expr');
    const from = prop(node, 'from');
    const to = prop(node, 'to');
    const isNot = propBool(node, 'negated');
    return betweenDoc(
        [expr ? printExpression(expr, opts, printFn) : '', ' ', isNot ? [keyword('NOT', opts), ' '] : '', keyword('BETWEEN', opts)],
        from ? printExpression(from, opts, printFn) : '',
        [keyword('AND', opts), ' ', to ? printExpression(to, opts, printFn) : ''],
    );
}

// ---------------------------------------------------------------------------
// FROM / JOIN
// ---------------------------------------------------------------------------

export function printTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    // A comment right after a table reference lands on its rightmost part — the table
    // name, or the last column of a join's ON condition. Claim it before the reference
    // prints (unless an enclosing join already has, to print between joins), print it after.
    const inner = rightmostCommentNode(node, node.endOffset);
    const own = inner && inner !== node && !isCommentClaimed(inner) ? inner : undefined;
    if (own) claimTrailingComment(own);
    const doc = withTrailingComment(node, printTableRefInner(node, opts, printFn));
    return own ? appendComments(doc, takeTrailingComment(own)) : doc;
}

function printTableRefInner(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    switch (node.type) {
        case 'NamedTableReference':
            return printNamedTableRef(node, opts, printFn);
        case 'VariableTableReference': {
            const varName = propStr(node, 'name') ?? node.text ?? '/* unknown table var */';
            const varAlias = propStr(node, 'alias');
            return varAlias ? [varName, aliasDoc(varAlias, opts)] : varName;
        }
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
        case 'BuiltInFunctionTableReference':
            return printBuiltInFunctionTableRef(node, opts, printFn);
        case 'OpenQueryTableReference':
            return printOpenQueryTableRef(node, opts);
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
        case 'PivotedTableReference':
            return printPivotedTableRef(node, opts, printFn);
        case 'UnpivotedTableReference':
            return printUnpivotedTableRef(node, opts, printFn);
        case 'InlineDerivedTable':
            return printInlineDerivedTable(node, opts, printFn);
        default:
            return node.text ?? `/* ${node.type} */`;
    }
}

/**
 * A table hint serialized by the builder. Index names and columns inside INDEX = ix,
 * INDEX(a, b) and FORCESEEK(ix(col)) are identifiers, so they keep their case.
 */
export function tableHintDoc(hint: string, opts: Options): Doc {
    const m = /^(INDEX|FORCESEEK)(\s*=\s*|\()([\s\S]*)$/.exec(hint);
    return m ? [keyword(m[1]!, opts), m[2]!, m[3]!] : keyword(hint, opts);
}

/** An OPTION (...) query hint serialized by the builder; TABLE HINT (object, hints) keeps the object's case. */
export function optimizerHintDoc(hint: string, opts: Options): Doc {
    const m = /^TABLE HINT \(([\s\S]*)\)$/.exec(hint);
    if (!m) return keyword(hint, opts);
    const [object, ...hints] = splitTopLevel(m[1]!);
    return [keyword('TABLE HINT', opts), ' ', optionItems([object!, ...hints.map((h) => tableHintDoc(h, opts))], opts)];
}

function printNamedTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const hints = node.props?.['hints'] as string[] | undefined;
    const nameDoc: Doc = schemaObjectName(prop(node, 'name'));
    const aliasPart: Doc = tableAliasDoc(node, opts);
    const hintsDoc: Doc = hints?.length
        ? [
              ' ',
              keyword('WITH', opts),
              ' ',
              optionItems(
                  hints.map((h) => tableHintDoc(h, opts)),
                  opts,
              ),
          ]
        : '';
    const tableSample = prop(node, 'tableSample');
    const temporal = prop(node, 'temporal');
    const sampleDoc: Doc = tableSample ? printTableSample(tableSample, opts, printFn) : '';
    const temporalDoc: Doc = temporal ? printTemporalClause(temporal, opts, printFn) : '';
    // Order: name, temporal, alias, tablesample, hints
    return [nameDoc, temporalDoc, aliasPart, sampleDoc, hintsDoc];
}

function joinTypeKeyword(jt: string, opts: Options, hint?: string | null): Doc {
    if (hint) {
        const typeWord = JOIN_TYPE_WORD[jt] ?? jt.toUpperCase();
        return keyword(`${typeWord} ${hint} JOIN`, opts);
    }
    return keyword(JOIN_TYPE_MAP[jt] ?? `${(JOIN_TYPE_WORD[jt] ?? jt.toUpperCase())} JOIN`, opts);
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
    const found = rightmostCommentNode(node, targetEndOffset);
    if (!found) return undefined;
    claimTrailingComment(found);
    return takeTrailingComment(found);
}

/** The node on the rightmost path (ending at targetEndOffset) that carries a trailing comment. */
function rightmostCommentNode(node: SqlNode | null, targetEndOffset: number): SqlNode | undefined {
    if (!node || node.endOffset !== targetEndOffset) return undefined;
    if (node.trailingComment) return node;
    const props = node.props;
    if (!props) return undefined;
    const vals = Object.values(props);
    for (let i = vals.length - 1; i >= 0; i--) {
        const v = vals[i];
        if (v && typeof v === 'object' && 'type' in (v as object)) {
            const found = rightmostCommentNode(v as SqlNode, targetEndOffset);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Claim the trailing comments a predicate tree prints itself — each predicate's, found
 * the way boolWithTrailing and printBoolBinary find them — so their parts don't print
 * them too. Runs before any part of the tree is printed.
 */
function claimPredicateComments(node: SqlNode | null): void {
    if (!node) return;
    if (node.type === 'BooleanBinary') {
        claimPredicateComments(prop(node, 'left'));
        claimPredicateComments(prop(node, 'right'));
        return;
    }
    const rp = rightmostPred(node);
    const found = rp ? rightmostCommentNode(rp, rp.endOffset) : undefined;
    if (found) claimTrailingComment(found);
}

function printQualifiedJoin(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const density = getDensity(opts);
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const condition = prop(node, 'condition');
    const jt = propStr(node, 'joinType') ?? 'Inner';
    const hint = propStr(node, 'joinHint');

    // compact: try to keep joins on one line (line = space when flat)
    // standard/spacious: always new line before each JOIN keyword
    const joinBreak = density === 'compact' ? line : hardline;

    const rightDoc: Doc = right ? printTableRef(right, opts, printFn) : '';
    // A trailing `--` comment on the right table (e.g. `JOIN u -- j\n ON ...`) queues as
    // a lineSuffix that only flushes at the next hardline — without one here it would
    // flush past the ON condition, landing on the wrong line. Force a break so it lands
    // right after the joined table, in place of the usual space before ON.
    const onSep: Doc = hasLineSuffix(rightDoc) ? hardline : ' ';

    let onDoc: Doc = '';
    if (condition) {
        onDoc = [onSep, joinOnDoc(keyword('ON', opts), printBoolExpr(condition, opts, printFn, true), condition.type === 'BooleanBinary')];
    }

    // A comment between two JOIN clauses lands on the rightmost descendant of
    // the left-child join (via Pass 3 `>=` tie-breaking).  Restrict search to
    // nodes whose endOffset == left.endOffset so subsequent joins don't
    // re-discover the same comment from an ancestor. Found (and claimed) before
    // the left side prints, so it isn't printed there too.
    const betweenComment = left ? rightmostTrailingComment(left, left.endOffset) : undefined;
    const leftDoc = left ? printTableRef(left, opts, printFn) : '';
    const commentLines: Doc[] = betweenComment ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c]) : [];
    const separator: Doc = commentLines.length > 0 ? [...commentLines, hardline] : joinBreak;

    return [
        leftDoc,
        separator,
        joinTypeKeyword(jt, opts, hint),
        ' ',
        rightDoc,
        onDoc,
    ];
}

function printUnqualifiedJoin(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const left = prop(node, 'left');
    const right = prop(node, 'right');
    const jt = propStr(node, 'joinType') ?? 'Cross';
    const kw =
        jt === 'CrossJoin'
            ? keyword('CROSS JOIN', opts)
            : jt === 'OuterApply'
              ? keyword('OUTER APPLY', opts)
              : keyword('CROSS APPLY', opts);

    // Unqualified joins have no condition; comment lands on left node itself.
    const betweenComment = left ? rightmostTrailingComment(left, left.endOffset) : undefined;
    const leftDoc = left ? printTableRef(left, opts, printFn) : '';
    const commentLines: Doc[] = betweenComment ? betweenComment.split('\n').flatMap((c): Doc[] => [hardline, c]) : [];
    // compact: the join stays on the line before when it fits, as a qualified join does
    const joinBreak = getDensity(opts) === 'compact' ? line : hardline;
    const separator: Doc = commentLines.length > 0 ? [...commentLines, hardline] : joinBreak;

    return [leftDoc, separator, kw, ' ', right ? printTableRef(right, opts, printFn) : ''];
}

function printJoinParenthesis(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const join = prop(node, 'join');
    const joinDoc = join ? printTableRef(join, opts, printFn) : '';
    return ['(', indent([hardline, joinDoc]), hardline, ')'];
}

function printInlineDerivedTable(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const rows = propArr(node, 'rows');
    const rowDocs = rows.map((r) => valuesRow(propArr(r, 'values').map((v) => printExpression(v, opts, printFn)), opts));
    const valuesBody = valuesDoc(rowDocs, rows[0] ? propArr(rows[0], 'values').length : 0, opts);
    // The VALUES list on lines of its own, as a subquery's SELECT would be
    return ['(', indent([hardline, valuesBody]), hardline, ')', tableAliasDoc(node, opts)];
}

function printQueryDerivedTable(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const query = prop(node, 'query');
    const queryDoc = query ? printQueryExpression(query, opts, printFn) : '/* query */';
    return ['(', indent([hardline, queryDoc]), hardline, ')', tableAliasDoc(node, opts)];
}

/** What follows a table reference: [FOR PATH] [AS alias [(a, b)]]. */
function tableAliasDoc(node: SqlNode, opts: Options): Doc {
    const forPath: Doc = propBool(node, 'forPath') ? [' ', keyword('FOR PATH', opts)] : '';
    const alias = propStr(node, 'alias');
    return [forPath, alias ? [aliasDoc(alias, opts), derivedColumns(node, opts)] : ''];
}

/** A derived table's column names: (SELECT ...) AS s (a, b). */
function derivedColumns(node: SqlNode, opts: Options): Doc {
    const columns = (node.props?.['columns'] as string[] | undefined) ?? [];
    return columns.length > 0 ? [' ', parenItems(columns, opts)] : '';
}

function printSchemaObjectFunctionTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const args = propArr(node, 'args');
    const alias = propStr(node, 'alias');
    const aliasColumns = propStrArr(node, 'aliasColumns');
    const argsDoc: Doc = join(
        ', ',
        args.map((a) => printExpression(a, opts, printFn)),
    );
    // e.g. `t.x.nodes('/r') AS n(x)` — the alias's own column list (xml .nodes()).
    const aliasPart: Doc = aliasColumns.length
        ? [' ', keyword('AS', opts), ' ', alias ?? '', parenList(aliasColumns)]
        : aliasDoc(alias, opts);
    return [schemaObjectName(prop(node, 'name')), '(', argsDoc, ')', aliasPart];
}

/** Built-in TVFs: STRING_SPLIT(@csv, ','), GENERATE_SERIES(1, 100), etc. */
function printBuiltInFunctionTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const name = propStr(node, 'name') ?? '';
    const args = propArr(node, 'args');
    const alias = propStr(node, 'alias');
    const argsDoc: Doc = join(
        ', ',
        args.map((a) => printExpression(a, opts, printFn)),
    );
    const aliasPart: Doc = aliasDoc(alias, opts);
    // ::fn_name(): a system function written with the leading colons
    const nameDoc: Doc = name.startsWith('::') ? ['::', keyword(name.slice(2), opts)] : keyword(name, opts);
    return [nameDoc, '(', argsDoc, ')', aliasPart];
}

/** OPENQUERY(linkedServer, 'sql') */
function printOpenQueryTableRef(node: SqlNode, opts: Options): Doc {
    const linkedServer = propStr(node, 'linkedServer') ?? '';
    const query = propStr(node, 'query') ?? '';
    const alias = propStr(node, 'alias');
    const aliasPart: Doc = aliasDoc(alias, opts);
    return [keyword('OPENQUERY', opts), '(', linkedServer, ', ', `'${query.replace(/'/g, "''")}'`, ')', aliasPart];
}

// ---------------------------------------------------------------------------
// Full-text: CONTAINS / FREETEXT predicates and CONTAINSTABLE / FREETEXTTABLE
// ---------------------------------------------------------------------------

/** Render the column-list argument: single column → bare name, multiple → (a, b), wildcard → *, PROPERTY(column, 'name') */
function fullTextColumnsPart(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const columns = propArr(node, 'columns');
    const propertyName = propStr(node, 'propertyName');
    if (propertyName && columns.length === 1) return [keyword('PROPERTY', opts), '(', printFn(columns[0]!), ', ', propertyName, ')'];
    if (columns.length === 0) return '*';
    if (columns.length === 1 && columns[0]!.type === 'WildcardColumn') return '*';
    if (columns.length === 1) return printFn(columns[0]!);
    return ['(', join(', ', columns.map(printFn)), ')'];
}

function printFullTextPredicate(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const fnType = propStr(node, 'functionType') ?? 'Contains';
    const fnKw = fnType === 'FreeText' ? keyword('FREETEXT', opts) : keyword('CONTAINS', opts);
    const value = prop(node, 'value');
    const language = propStr(node, 'language');

    const args: Doc[] = [
        fullTextColumnsPart(node, opts, printFn),
        ', ',
        value ? printExpression(value, opts, printFn) : '',
    ];
    if (language) args.push(', ', keyword('LANGUAGE', opts), ' ', language);

    return [fnKw, '(', ...args, ')'];
}

function printFullTextTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const fnType = propStr(node, 'functionType') ?? 'Contains';
    const fnKw = fnType === 'FreeText' ? keyword('FREETEXTTABLE', opts) : keyword('CONTAINSTABLE', opts);
    const tableName = prop(node, 'tableName');
    const searchCondition = prop(node, 'searchCondition');
    const topN = prop(node, 'topN');
    const language = propStr(node, 'language');
    const alias = propStr(node, 'alias');

    const args: Doc[] = [
        schemaObjectName(tableName),
        ', ',
        fullTextColumnsPart(node, opts, printFn),
        ', ',
        searchCondition ? printExpression(searchCondition, opts, printFn) : '',
    ];
    if (language) args.push(', ', keyword('LANGUAGE', opts), ' ', language);
    if (topN) args.push(', ', printExpression(topN, opts, printFn));

    const aliasPart: Doc = aliasDoc(alias, opts);
    return [fnKw, '(', ...args, ')', aliasPart];
}

function rowsetWithClause(items: SqlNode[], opts: Options): Doc {
    return [
        ' ',
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
          ? [' ', keyword('WITH', opts), ' ', schemaObjectName(tableName)]
          : '';
    const aliasPart: Doc = aliasDoc(alias, opts);
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
    const aliasPart: Doc = aliasDoc(alias, opts);
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

    const withColumns = propArr(node, 'withColumns');
    const withPart: Doc = withColumns.length ? rowsetWithClause(withColumns, opts) : '';
    const aliasPart: Doc = aliasDoc(alias, opts);
    return [
        group([
            keyword('OPENROWSET', opts),
            '(',
            indent([softline, providerName, ',', line, connection, ',', line, third]),
            softline,
            ')',
        ]),
        withPart,
        aliasPart,
    ];
}

function printBulkOpenRowset(node: SqlNode, opts: Options): Doc {
    const dataFiles = node.props?.['dataFiles'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const alias = propStr(node, 'alias');

    const dataFile = dataFiles?.[0] ?? '';
    const allArgs: Doc[] = [keyword('BULK', opts), ' ', dataFile, ...(options ?? []).map((o): Doc => [',', line, o])];

    const withColumns = propArr(node, 'withColumns');
    const withPart: Doc = withColumns.length ? rowsetWithClause(withColumns, opts) : '';
    const aliasPart: Doc = aliasDoc(alias, opts);
    return [group([keyword('OPENROWSET', opts), '(', indent([softline, ...allArgs]), softline, ')']), withPart, aliasPart];
}

// ---------------------------------------------------------------------------
// ORDER BY
// ---------------------------------------------------------------------------

export function printOrderByClause(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    return listClauseDoc(keyword('ORDER BY', opts), orderByItems(node, opts, printFn), opts);
}

/** The items of an ORDER BY, each with its ASC / DESC. */
function orderByItems(node: SqlNode, opts: Options, printFn: PrintFn): Doc[] {
    return propArr(node, 'elements').map((e) => {
        const expr = prop(e, 'expression');
        const sort = propStr(e, 'sortOrder');
        const base: Doc = [expr ? printExpression(expr, opts, printFn) : '', sortOrderDoc(sort, opts)];
        // With an explicit ASC/DESC, the OrderByElement's own endOffset extends past its
        // expression, so a trailing comment (e.g. `order by a -- c`, reparsed) attaches to
        // the element itself rather than the expression — print that too.
        return appendComments(base, takeTrailingComment(e));
    });
}

// ---------------------------------------------------------------------------
// NEXT VALUE FOR, PARSE / TRY_PARSE
// ---------------------------------------------------------------------------

function printNextValueFor(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const nameDoc = schemaObjectName(prop(node, 'name'));
    const over = prop(node, 'over');
    const parts: Doc[] = [keyword('NEXT VALUE FOR', opts), ' ', nameDoc];
    if (over) parts.push(' ', keyword('OVER', opts), ' ', printOverClause(over, opts, printFn));
    return parts;
}

function printPartitionFunctionCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const db = propStr(node, 'database');
    const name = propStr(node, 'name') ?? '';
    const args = propArr(node, 'args').map((a) => printExpression(a, opts, printFn));
    const prefix = db ? `${db}.$PARTITION.` : '$PARTITION.';
    return group([prefix, name, '(', indent([softline, join([',', line], args)]), softline, ')']);
}

function printIdentityFunctionCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const dataType = propStr(node, 'dataType') ?? '';
    const seed = prop(node, 'seed');
    const inc = prop(node, 'increment');
    const parts: Doc[] = [keyword(dataType, opts)];
    if (seed) parts.push(', ', printExpression(seed, opts, printFn));
    if (inc) parts.push(', ', printExpression(inc, opts, printFn));
    return [keyword('IDENTITY', opts), '(', ...parts, ')'];
}

function printExtractFrom(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const element = propStr(node, 'element') ?? '';
    const expr = prop(node, 'expression');
    return [
        keyword('EXTRACT', opts),
        '(',
        keyword(element, opts),
        ' ',
        keyword('FROM', opts),
        ' ',
        expr ? printExpression(expr, opts, printFn) : '',
        ')',
    ];
}

function printParseCall(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const isTry = node.type === 'TryParseCall';
    const fnKw = isTry ? keyword('TRY_PARSE', opts) : keyword('PARSE', opts);
    const valueDoc = printExpression(prop(node, 'value')!, opts, printFn);
    const dataType = propStr(node, 'dataType') ?? '';
    const culture = prop(node, 'culture');
    const parts: Doc[] = [valueDoc, ' ', keyword('AS', opts), ' ', typeDoc(node, dataType, opts)];
    if (culture) parts.push(' ', keyword('USING', opts), ' ', printExpression(culture, opts, printFn));
    return group([fnKw, '(', indent([softline, ...parts]), softline, ')']);
}

// ---------------------------------------------------------------------------
// TABLESAMPLE
// ---------------------------------------------------------------------------

function printTableSample(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const isSystem = node.props?.['system'] as boolean | undefined;
    const sampleNumber = prop(node, 'sampleNumber');
    const option = propStr(node, 'option');
    const repeatSeed = prop(node, 'repeatSeed');

    const systemKw: Doc = isSystem ? [' ', keyword('SYSTEM', opts)] : '';
    const numDoc = sampleNumber ? printExpression(sampleNumber, opts, printFn) : '';
    const optDoc: Doc = option ? [' ', keyword(option.toUpperCase(), opts)] : '';
    const repeatDoc: Doc = repeatSeed
        ? [' ', keyword('REPEATABLE', opts), ' (', printExpression(repeatSeed, opts, printFn), ')']
        : '';
    return [' ', keyword('TABLESAMPLE', opts), systemKw, ' (', numDoc, optDoc, ')', repeatDoc];
}

// ---------------------------------------------------------------------------
// FOR SYSTEM_TIME (temporal tables)
// ---------------------------------------------------------------------------

function printTemporalClause(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const clauseType = propStr(node, 'clauseType');
    const startTime = prop(node, 'startTime');
    const endTime = prop(node, 'endTime');
    const startDoc = startTime ? printExpression(startTime, opts, printFn) : '';
    const endDoc = endTime ? printExpression(endTime, opts, printFn) : '';
    const prefix = [' ', keyword('FOR SYSTEM_TIME', opts)];
    switch (clauseType) {
        case 'AsOf':
            return [...prefix, ' ', keyword('AS OF', opts), ' ', startDoc];
        case 'FromTo':
            return [...prefix, ' ', keyword('FROM', opts), ' ', startDoc, ' ', keyword('TO', opts), ' ', endDoc];
        case 'Between':
            return [...prefix, ' ', keyword('BETWEEN', opts), ' ', startDoc, ' ', keyword('AND', opts), ' ', endDoc];
        case 'ContainedIn':
            return [...prefix, ' ', keyword('CONTAINED IN', opts), ' (', startDoc, ', ', endDoc, ')'];
        case 'TemporalAll':
            return [...prefix, ' ', keyword('ALL', opts)];
        default:
            return '';
    }
}

// ---------------------------------------------------------------------------
// FOR XML / FOR JSON
// ---------------------------------------------------------------------------

// Map ScriptDom enum names to their SQL keyword equivalents
const XML_JSON_OPTION_KW: Record<string, string> = {
    IncludeNullValues: 'INCLUDE_NULL_VALUES',
    WithoutArrayWrapper: 'WITHOUT_ARRAY_WRAPPER',
    BinaryBase64: 'BINARY BASE64',
    XmlSchema: 'XMLSCHEMA',
    XmlData: 'XMLDATA',
    ElementsXsiNil: 'ELEMENTS XSINIL',
    ElementsAbsent: 'ELEMENTS ABSENT',
    ElementsAll: 'ELEMENTS',
};

function xmlJsonOptionKw(kind: string, opts: Options): Doc {
    return keyword(XML_JSON_OPTION_KW[kind] ?? kind.toUpperCase(), opts);
}

function printForXmlJsonOptions(forKw: string, node: SqlNode, opts: Options): Doc {
    const options = node.props?.['options'] as Array<{ kind: string; value?: string }> | undefined;
    const kwDoc = keyword(forKw, opts);
    if (!options?.length) return kwDoc;
    const optDocs = options.map((o) => {
        const kw = xmlJsonOptionKw(o.kind, opts);
        return o.value != null ? [kw, "('", o.value, "')"] : kw;
    });
    return [kwDoc, ' ', join(', ', optDocs)];
}

function printForClause(node: SqlNode, opts: Options): Doc {
    switch (node.type) {
        case 'ForXmlClause':
            return printForXmlJsonOptions('FOR XML', node, opts);
        case 'ForJsonClause':
            return printForXmlJsonOptions('FOR JSON', node, opts);
        case 'ForBrowseClause':
            return keyword('FOR BROWSE', opts);
        case 'ForReadOnlyClause':
            return keyword('FOR READ ONLY', opts);
        case 'ForUpdateClause': {
            const cols = node.props?.['columns'] as string[] | undefined;
            if (cols?.length) return [keyword('FOR UPDATE OF', opts), ' ', join(', ', cols)];
            return keyword('FOR UPDATE', opts);
        }
        default:
            return node.text ?? keyword('FOR', opts);
    }
}

// ---------------------------------------------------------------------------
// PIVOT / UNPIVOT
// ---------------------------------------------------------------------------

function printPivotedTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const tableRef = prop(node, 'tableRef');
    const aggregateFn = propStr(node, 'aggregateFn') ?? 'agg';
    const valueColumns = node.props?.['valueColumns'] as string[] | undefined;
    const pivotColumn = propStr(node, 'pivotColumn') ?? '';
    const inColumns = node.props?.['inColumns'] as string[] | undefined;
    const alias = propStr(node, 'alias');

    const tableDoc = tableRef ? printTableRef(tableRef, opts, printFn) : '';
    const aggArgs = (valueColumns ?? []).join(', ');
    const inCols = (inColumns ?? []).map((c) => `[${c}]`).join(', ');
    const aliasPart: Doc = aliasDoc(alias, opts);

    return group([
        tableDoc,
        hardline,
        keyword('PIVOT', opts),
        ' (',
        indent([
            softline,
            keyword(aggregateFn, opts),
            '(',
            aggArgs,
            ')',
            hardline,
            keyword('FOR', opts),
            ' ',
            pivotColumn,
            ' ',
            keyword('IN', opts),
            ' (',
            inCols,
            ')',
        ]),
        softline,
        ')',
        aliasPart,
    ]);
}

function printUnpivotedTableRef(node: SqlNode, opts: Options, printFn: PrintFn): Doc {
    const tableRef = prop(node, 'tableRef');
    const valueColumn = propStr(node, 'valueColumn') ?? '';
    const pivotColumn = propStr(node, 'pivotColumn') ?? '';
    const inColumns = node.props?.['inColumns'] as string[] | undefined;
    const alias = propStr(node, 'alias');

    const tableDoc = tableRef ? printTableRef(tableRef, opts, printFn) : '';
    const inCols = (inColumns ?? []).join(', ');
    const aliasPart: Doc = aliasDoc(alias, opts);

    return group([
        tableDoc,
        hardline,
        keyword('UNPIVOT', opts),
        ' (',
        indent([
            softline,
            valueColumn,
            ' ',
            keyword('FOR', opts),
            ' ',
            pivotColumn,
            ' ',
            keyword('IN', opts),
            ' (',
            inCols,
            ')',
        ]),
        softline,
        ')',
        aliasPart,
    ]);
}

/** `GROUP BY` or `GROUP BY ALL` (which also returns groups the WHERE clause filtered out). */
function groupByKeyword(groupBy: SqlNode, opts: Options): Doc {
    return keyword(propBool(groupBy, 'all') ? 'GROUP BY ALL' : 'GROUP BY', opts);
}

/** Legacy ` WITH ROLLUP` / ` WITH CUBE` after the GROUP BY list. */
function groupByWithOption(groupBy: SqlNode, opts: Options): Doc {
    const option = propStr(groupBy, 'withOption');
    return option ? [' ', keyword(option, opts)] : '';
}
