import type { SqlNode } from '@prettier-sql/core/types';
import { prop, propArr, propStr, propBool, propStrArr } from '@prettier-sql/core/printer/helpers';
export { prop, propArr, propStr, propBool, propStrArr };

export function rangeVarName(node: SqlNode | null): string {
    if (!node) return '';
    const parts: string[] = [];
    const schema = propStr(node, 'schema');
    const name = propStr(node, 'name');
    if (schema) parts.push(schema);
    if (name) parts.push(name);
    return parts.join('.');
}

export function qualifiedName(schema: string | null | undefined, name: string): string {
    return schema ? `${schema}.${name}` : name;
}
