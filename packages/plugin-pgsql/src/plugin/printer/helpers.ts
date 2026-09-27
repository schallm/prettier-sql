import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import { keyword, join, type Options } from '@prettier-sql/core/printer/utils';
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

/**
 * `ONLY ` prefix for a RangeVar written as `ONLY t` (excluding inheritance children
 * and partitions). Only valid where PostgreSQL accepts ONLY: FROM, UPDATE, DELETE,
 * ALTER TABLE, TRUNCATE and LOCK.
 */
export function onlyPrefix(node: SqlNode | null, opts: Options): Doc {
    return node && propBool(node, 'only') ? [keyword('ONLY', opts), ' '] : '';
}

/** `OPTIONS (name 'value', ...)` — FDW options on a foreign server/table/column. */
export function printFdwOptions(node: SqlNode, opts: Options): Doc {
    const options = propArr(node, 'options');
    if (options.length === 0) return '';
    const pairs = options.map((o) => {
        const key = propStr(o, 'key') ?? '';
        const val = propStr(o, 'val') ?? '';
        return [key, " '", val.replace(/'/g, "''"), "'"].join('') as Doc;
    });
    return [' ', keyword('OPTIONS', opts), ' (', join(', ', pairs), ')'];
}
