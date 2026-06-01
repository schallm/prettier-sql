import type { SqlNode } from '@prettier-sql/core/types';
import { prop, propArr, propStr, propBool } from '@prettier-sql/core/printer/helpers';
export { prop, propArr, propStr, propBool };

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

export function assignmentOp(op: string): string {
    switch (op) {
        case 'Equals':         return '=';
        case 'AddEquals':      return '+=';
        case 'SubtractEquals': return '-=';
        case 'MultiplyEquals': return '*=';
        case 'DivideEquals':   return '/=';
        case 'ModEquals':      return '%=';
        case 'BitwiseAndEquals': return '&=';
        case 'BitwiseOrEquals':  return '|=';
        case 'BitwiseXorEquals': return '^=';
        default: return op;
    }
}
