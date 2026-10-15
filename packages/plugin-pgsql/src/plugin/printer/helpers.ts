import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import { keyword, optionItems, type Options } from '@prettier-sql/core/printer/utils';
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
        return [key, ' ', sqlString(val)].join('') as Doc;
    });
    return [' ', keyword('OPTIONS', opts), ' ', optionItems(pairs, opts)];
}

/**
 * A string constant: `'it''s'`, or an escape string `E'a\rb'` when the value holds a control
 * character other than a newline or tab. Written raw, a carriage return (or a CRLF pair)
 * would be turned into a newline by the line-ending normalization of the next format or any
 * editor, changing the value; other control characters are invisible. Mirrors Ident.Literal.
 */
export function sqlString(text: string): string {
    // eslint-disable-next-line no-control-regex
    if (!/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) return `'${text.replace(/'/g, "''")}'`;
    const escapes: Record<string, string> = { "'": "''", '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
    // eslint-disable-next-line no-control-regex
    return `E'${text.replace(/['\\\x00-\x1f\x7f]/g, (c) => escapes[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}'`;
}
