import type { SqlNode } from '../parser/types.js';

/**
 * Typed prop accessors for SqlNode.
 * Both statements.ts and expressions.ts use these helpers to extract
 * typed values from the untyped `node.props` record.
 */

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
 * Build a dotted schema-qualified object name (e.g. "dbo.Books") from a name node.
 * Includes server and database parts when present for four-part names.
 */
export function schemaObjectName(nameNode: SqlNode | null): string {
    if (!nameNode) return '';
    const parts: string[] = [];
    const srv    = propStr(nameNode, 'server');
    const db     = propStr(nameNode, 'database');
    const schema = propStr(nameNode, 'schema');
    const nm     = propStr(nameNode, 'name');
    if (srv)    parts.push(srv);
    if (db)     parts.push(db);
    if (schema) parts.push(schema);
    if (nm)     parts.push(nm);
    return parts.join('.');
}

/**
 * Map a ScriptDom assignment operator name to its SQL symbol.
 * Covers the compound assignment operators used in SET and UPDATE.
 */
export function assignmentOp(op: string): string {
    if (op === 'Equals')          return '=';
    if (op === 'AddEquals')       return '+=';
    if (op === 'SubtractEquals')  return '-=';
    return op;
}
