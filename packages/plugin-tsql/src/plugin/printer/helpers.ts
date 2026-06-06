import type { SqlNode } from '@prettier-sql/core/types';
import { prop, propArr, propStr, propBool, propStrArr } from '@prettier-sql/core/printer/helpers';
export { prop, propArr, propStr, propBool, propStrArr };

export function schemaObjectName(nameNode: SqlNode | null): string {
    if (!nameNode) return '';
    const srv = propStr(nameNode, 'server');
    const db = propStr(nameNode, 'database');
    const schema = propStr(nameNode, 'schema');
    const nm = propStr(nameNode, 'name') ?? '';

    // Four-part: server present — join all four, empty string for absent middle parts
    if (srv) return [srv, db ?? '', schema ?? '', nm].join('.');
    // Three-part: database present — use '..' when schema is absent (default schema)
    if (db) return schema ? `${db}.${schema}.${nm}` : `${db}..${nm}`;
    // Two-part: schema only
    if (schema) return `${schema}.${nm}`;
    // One-part: bare name
    return nm;
}

const ASSIGNMENT_OPS: Record<string, string> = {
    Equals:           '=',
    AddEquals:        '+=',
    SubtractEquals:   '-=',
    MultiplyEquals:   '*=',
    DivideEquals:     '/=',
    ModEquals:        '%=',
    BitwiseAndEquals: '&=',
    BitwiseOrEquals:  '|=',
    BitwiseXorEquals: '^=',
};

export function assignmentOp(op: string): string {
    return ASSIGNMENT_OPS[op] ?? op;
}
