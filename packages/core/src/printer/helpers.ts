import type { SqlNode } from '../types.js';

export function prop(node: SqlNode, key: string): SqlNode | null {
    return (node.props?.[key] as SqlNode | null) ?? null;
}

export function propArr(node: SqlNode, key: string): SqlNode[] {
    const v = node.props?.[key];
    if (!Array.isArray(v)) return [];
    return v as SqlNode[];
}

export function propStr(node: SqlNode, key: string): string | null {
    const v = node.props?.[key];
    return typeof v === 'string' ? v : null;
}

export function propBool(node: SqlNode, key: string): boolean {
    return node.props?.[key] === true;
}

export function propStrArr(node: SqlNode, key: string): string[] {
    const v = node.props?.[key];
    if (!Array.isArray(v)) return [];
    return v as string[];
}
