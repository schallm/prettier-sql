import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import { keyword, ifExistsDoc } from '@prettier-sql/core/printer/utils';
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

/** `DROP <keyword> [IF EXISTS] <name>;` — shared by every simple single-object DROP
 *  statement that only carries a name and an `ifExists` flag (schema, user, login,
 *  role, partition function/scheme, Always Encrypted keys, etc.). `name` is a Doc
 *  rather than a plain string so callers needing a multi-part name can pass the
 *  result of `schemaObjectName()` or similar. */
export function printDropSingleObject(kw: string, node: SqlNode, opts: Options, name: Doc): Doc {
    const ifExists = propBool(node, 'ifExists');
    return [keyword(kw, opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
}
