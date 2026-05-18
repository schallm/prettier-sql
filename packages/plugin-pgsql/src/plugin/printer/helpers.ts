import type { SqlNode } from '../parser/types.js';

/** Return a child node by key, or null if absent / wrong type. */
export function prop(node: SqlNode, key: string): SqlNode | null {
    return (node.props?.[key] as SqlNode | null) ?? null;
}

/** Return an array of child nodes by key, or [] if absent / not an array. */
export function propArr(node: SqlNode, key: string): SqlNode[] {
    const v = node.props?.[key];
    if (!Array.isArray(v)) return [];
    return v as SqlNode[];
}

/** Return a string prop by key, or null. */
export function propStr(node: SqlNode, key: string): string | null {
    const v = node.props?.[key];
    return typeof v === 'string' ? v : null;
}

/** Return a boolean prop by key (false if absent). */
export function propBool(node: SqlNode, key: string): boolean {
    return node.props?.[key] === true;
}

/**
 * Build a dotted schema-qualified name (e.g. "public.books") from a RangeVar node.
 */
export function rangeVarName(node: SqlNode | null): string {
    if (!node) return '';
    const parts: string[] = [];
    const schema = propStr(node, 'schema');
    const name = propStr(node, 'name');
    if (schema) parts.push(schema);
    if (name) parts.push(name);
    return parts.join('.');
}
