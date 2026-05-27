import type { SqlNode } from '@prettier-sql/core/types';
import { prop, propArr, propStr, propBool } from '@prettier-sql/core/printer/helpers';
export { prop, propArr, propStr, propBool };

export function schemaObjectName(nameNode: SqlNode | null): string {
    if (!nameNode) return '';
    const parts: string[] = [];
    const srv = propStr(nameNode, 'server');
    const db = propStr(nameNode, 'database');
    const schema = propStr(nameNode, 'schema');
    const nm = propStr(nameNode, 'name');
    if (srv) parts.push(srv);
    if (db) parts.push(db);
    if (schema) parts.push(schema);
    if (nm) parts.push(nm);
    return parts.join('.');
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
