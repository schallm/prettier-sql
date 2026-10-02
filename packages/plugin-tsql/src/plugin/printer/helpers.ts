import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import { keyword, ifExistsDoc, lineSuffix, hardline } from '@prettier-sql/core/printer/utils';
import { builders } from 'prettier/doc';

const { breakParent } = builders;

/**
 * A built-in data type as written, keyword-cased. Sizes and MAX are keyword-cased with the name;
 * an xml schema collection inside `xml(CONTENT dbo.sc)` is an identifier, so only CONTENT / DOCUMENT is.
 */
export function builtinTypeDoc(dataType: string, opts: Options): Doc {
    const open = dataType.indexOf('(');
    if (open < 0 || !dataType.endsWith(')')) return keyword(dataType, opts);
    const inner = dataType.slice(open + 1, -1);
    // Sizes are written `(10, 2)` whatever the input spacing, as in a column definition
    if (/^[\s\d,]*$/.test(inner)) return keyword(`${dataType.slice(0, open)}(${inner.trim().split(/\s*,\s*/).join(', ')})`, opts);
    if (/^\s*max\s*$/i.test(inner)) return keyword(dataType, opts);
    const xml = /^(\s*)(content|document)(\s+)([\s\S]*)$/i.exec(inner);
    return [keyword(dataType.slice(0, open), opts), '(', xml ? [xml[1]!, keyword(xml[2]!, opts), xml[3]!, xml[4]!] : inner, ')'];
}
import { prop, propArr, propStr, propBool, propStrArr } from '@prettier-sql/core/printer/helpers';
export { prop, propArr, propStr, propBool, propStrArr };

// Trailing comments inside a statement. Comments attach to the nearest node in the
// source, often one whose printer never looks for a comment (a table name, a column
// reference), so:
//  - a clause that lays out a comment itself (a WHERE after a predicate, a join between
//    joins, a table reference after itself) claims the node before any of it prints,
//    then takes the comment when it prints it;
//  - every other node prints its own (withTrailingComment);
//  - each comment is printed once (takeTrailingComment), and anything still unprinted
//    once its statement is printed goes after the statement (unprintedComments), so a
//    comment is never silently dropped.
const claimedComments = new WeakSet<SqlNode>();
const printedComments = new WeakSet<SqlNode>();
const printedLeading = new WeakSet<SqlNode>();
/** Statements standing alone as an IF/ELSE/WHILE body, with no BEGIN/END around them. */
const singleBodies = new WeakSet<SqlNode>();

export function markSingleBody(node: SqlNode): void {
    singleBodies.add(node);
}

export function isSingleBody(node: SqlNode): boolean {
    return singleBodies.has(node);
}

/** Marks a node's leadingComments as printed, and returns them. */
export function takeLeadingComments(node: SqlNode): string[] {
    if (!node.leadingComments?.length || printedLeading.has(node)) return [];
    printedLeading.add(node);
    return node.leadingComments;
}

export function claimTrailingComment(node: SqlNode): void {
    claimedComments.add(node);
}

export function isCommentClaimed(node: SqlNode): boolean {
    return claimedComments.has(node);
}

/** The node's trailing comment, marked printed — or undefined if it has none or was printed already. */
export function takeTrailingComment(node: SqlNode | null | undefined): string | undefined {
    if (!node?.trailingComment || printedComments.has(node)) return undefined;
    printedComments.add(node);
    return node.trailingComment;
}

/**
 * A doc followed by comments: line comments end at the next line break, block comments
 * sit inline. A trailingComment can hold several comments joined by '\n' (attachment
 * merges consecutive comments onto the same nearest node) — a line comment's content is
 * only flushed at the *next* hardline in the surrounding doc, so back-to-back line
 * comments with nothing but breakParent between them would flush together on the same
 * line; a real hardline between them forces each onto its own line.
 */
export function appendComments(doc: Doc, comment: string | undefined): Doc {
    if (!comment) return doc;
    let prevWasLineComment = false;
    return comment.split('\n').map((c) => c.trim()).reduce<Doc>(
        (d, c) => {
            const lineSep = prevWasLineComment ? hardline : '';
            if (c.startsWith('--')) {
                prevWasLineComment = true;
                return [d, lineSep, lineSuffix([' ', c]), breakParent];
            }
            prevWasLineComment = false;
            return [d, lineSep || ' ', c];
        },
        doc,
    );
}

/** A node's doc followed by its trailing comment, unless a clause prints that comment itself. */
export function withTrailingComment(node: SqlNode, doc: Doc): Doc {
    if (claimedComments.has(node) || node.type.endsWith('Statement')) return doc;
    return appendComments(doc, takeTrailingComment(node));
}

/** Trailing comments under a statement that its printing didn't emit. */
export function unprintedComments(stmt: SqlNode): string[] {
    const out: string[] = [];
    const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (!v || typeof v !== 'object') return;
        const n = v as SqlNode;
        if (typeof n.type === 'string' && n !== stmt) {
            out.push(...takeLeadingComments(n));
            const c = takeTrailingComment(n);
            if (c) out.push(c);
        }
        for (const child of Object.values(n.props ?? {})) walk(child);
    };
    walk(stmt);
    return out;
}

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
