import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, join, indent, hardline, aliasDoc } from './utils.js';
import { prop, propArr, propStr, propBool, rangeVarName } from './helpers.js';

type PrintFn = (node: SqlNode) => Doc;

export function printExpression(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    switch (node.type) {
        case 'SelectStatement': return printSelectExpr(node, opts, printNode);
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
        case 'Constraint': return printConstraint(node, opts);
        case 'AlterCmd': return printAlterCmd(node, opts, printNode);
        case 'FunctionParam': return printFunctionParam(node, opts);
        case 'IndexElem': return propStr(node, 'name') ?? '';
        case 'ExprList': return join(', ', propArr(node, 'items').map(printNode));
        case 'ArrayExpr': return printArrayExpr(node, opts, printNode);
        case 'Coalesce': return printCoalesce(node, opts, printNode);
        case 'RowExpr': return ['(', join(', ', propArr(node, 'args').map(printNode)), ')'];
        case 'ParamRef': return node.text ?? '$?';
        case 'CTE': return printCteInline(node, opts, printNode);
        case 'WithClause': return '';
        default: return node.text ?? `/* unknown: ${node.type} */`;
    }
}

// ---------------------------------------------------------------------------
// SELECT as subexpression (subquery in FROM etc.)
// ---------------------------------------------------------------------------

function printSelectExpr(node: SqlNode, _opts: Options, printNode: PrintFn): Doc {
    return printNode(node);
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
    const mk = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const args = propArr(node, 'args');
    const star = propBool(node, 'star');
    const distinct = propBool(node, 'distinct');

    const argDocs: Doc[] = star ? [mk('*')] : args.map(printNode);
    if (distinct) argDocs.unshift(mk('DISTINCT'), ' ');

    return [mk(name), '(', join(', ', argDocs), ')'];
}

function printCast(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const arg = prop(node, 'arg');
    const typeName = propStr(node, 'typeName') ?? '';
    return [mk('CAST'), '(', arg ? printNode(arg) : '', ' ', mk('AS'), ' ', mk(typeName), ')'];
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
    const mk = (kw: string) => keyword(kw, opts);
    const joinType = propStr(node, 'joinType') ?? 'INNER';
    const lhs = prop(node, 'lhs');
    const rhs = prop(node, 'rhs');
    const on = prop(node, 'on');
    const using = propArr(node, 'using');

    const joinKw = joinType === 'INNER' ? mk('JOIN') : [mk(joinType), ' ', mk('JOIN')];
    const condition = on
        ? [' ', mk('ON'), ' ', printNode(on)]
        : using.length > 0
          ? [' ', mk('USING'), ' (', join(', ', using.map(printNode)), ')']
          : '';

    return [lhs ? printNode(lhs) : '', hardline, joinKw, ' ', rhs ? printNode(rhs) : '', condition];
}

function printSubquery(node: SqlNode, opts: Options, printNode: PrintFn): Doc {
    const subquery = prop(node, 'subquery');
    return ['(', indent([hardline, subquery ? printNode(subquery) : '']), hardline, ')', aliasDoc(propStr(node, 'alias'), opts)];
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

function printColumnDef(node: SqlNode, opts: Options, _printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const name = propStr(node, 'name') ?? '';
    const typeName = propStr(node, 'typeName') ?? '';
    return [name, ' ', mk(typeName)];
}

function printConstraint(node: SqlNode, opts: Options): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const contype = propStr(node, 'contype') ?? '';
    const name = propStr(node, 'name');
    const prefix = name ? [mk('CONSTRAINT'), ' ', name, ' '] : '';
    return [prefix, mk(contype.replace(/_/g, ' '))];
}

function printAlterCmd(node: SqlNode, opts: Options, _printNode: PrintFn): Doc {
    const mk = (kw: string) => keyword(kw, opts);
    const subtype = propStr(node, 'subtype') ?? '';
    const name = propStr(node, 'name') ?? '';
    return [mk(subtype.replace(/_/g, ' ')), ' ', name];
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
