import type { Doc } from 'prettier';
import type { SqlNode } from '../types.js';
import {
    keyword, getDensity, getCommaStyle, hasLineSuffix, hardSep, softSep,
    conditionalGroup, fill, group, hardline, indent, join, line, softline, willBreak,
    type Options,
} from './utils.js';

// Layouts both dialects share. The two parsers' trees have nothing in common, so these
// take docs each plugin has already printed and decide only how they're laid out.

/**
 * One arm of a CASE, `WHEN cond THEN result` or `ELSE result`: the tail goes on an indented
 * line of its own when the arm doesn't fit, unless a part is forced to break (it spans lines, or has a line comment).
 */
export function caseArm(head: Doc, tail: Doc): Doc {
    if (willBreak(head) || willBreak(tail)) return [head, ' ', tail];
    return group([head, indent([line, tail])]);
}

/**
 * `head low AND high`: on one line when it fits; otherwise the AND bound goes on an indented
 * line of its own; and when even `head low` doesn't fit, the bounds each go on an indented line.
 */
export function betweenDoc(head: Doc, low: Doc, andHigh: Doc): Doc {
    return conditionalGroup([
        [head, ' ', low, ' ', andHigh],
        [head, ' ', low, indent([hardline, andHigh])],
        [head, indent([hardline, low, hardline, andHigh])],
    ]);
}

/**
 * The terms of a `+ -` or `||` chain, each after the operator that precedes it: as many
 * per line as fit, each continuation line indented and led by its operator.
 * Flat: "a + b - c". Filling: "a + b\n  + c - d". `tail` is text that follows the chain on
 * its line (a select item's ` AS alias`); the last piece takes it, so the fill counts it.
 */
export function operatorChain(terms: { op: string; term: Doc }[], tail: Doc = ''): Doc {
    const [first, ...rest] = terms;
    const pieces = rest.map((t, i): Doc => indent([t.op, ' ', t.term, i === rest.length - 1 ? tail : '']));
    return fill([first!.term, ...pieces.flatMap((piece): Doc[] => [indent(line), piece])]);
}

/**
 * Fill-pack a list of docs using commas — wraps at printWidth, keeping each
 * item together with its associated comma. Used for UPDATE SET, VALUES rows,
 * etc. in standard/compact density.
 *
 * Trailing commas: `item1, item2,\n    item3`
 * Leading commas:  `item1\n, item2\n, item3`
 */
export function fillList(docs: Doc[], opts: Options): Doc {
    const leading = getCommaStyle(opts) === 'leading';
    return fill(
        docs.flatMap((d, i) => {
            if (i === 0) return [d] as Doc[];
            // After a line comment the break is forced, or the next item joins the comment
            const forced = hasLineSuffix(docs[i - 1]!);
            // leading: the ', ' already carries the space, so a flat break must print nothing
            return leading
                ? ([forced ? hardline : softline, [', ', d]] as Doc[])
                : ([[',', forced ? hardline : line], d] as Doc[]);
        }),
    );
}

/** One row of a VALUES list: `(a, b, c)`, its items on indented lines when it doesn't fit. */
export function valuesRow(items: Doc[], opts: Options): Doc {
    return group(['(', indent([softline, join(softSep(opts), items)]), softline, ')']);
}

/**
 * `VALUES (…), (…)`. A single row stays on the VALUES line. Otherwise the rows go on
 * indented lines: packed several to a line in compact density or when each row has a
 * single column (rows are short), and one per line otherwise.
 */
export function valuesDoc(rowDocs: Doc[], columnCount: number, opts: Options): Doc {
    const kw = keyword('VALUES', opts);
    if (rowDocs.length === 1) return [kw, ' ', rowDocs[0]!];
    const density = getDensity(opts);
    const packed = density === 'compact' || (density === 'standard' && columnCount === 1);
    return [kw, indent([hardline, packed ? fillList(rowDocs, opts) : join(hardSep(opts), rowDocs)])];
}

/**
 * `SET a = 1, b = 2` of an UPDATE: a single assignment stays on the SET line (except in
 * spacious density); several go on indented lines, packed unless spacious.
 */
export function setClauseDoc(assignments: Doc[], opts: Options): Doc {
    const density = getDensity(opts);
    const body: Doc = density !== 'spacious' && assignments.length === 1
        ? [' ', assignments[0]!]
        : indent([hardline, density === 'spacious' ? join(hardSep(opts), assignments) : fillList(assignments, opts)]);
    return [keyword('SET', opts), body];
}

/** `lhs UNION rhs` (or INTERSECT / EXCEPT): the operator stands alone between blank lines. */
export function setOpDoc(lhs: Doc, opKw: Doc, rhs: Doc): Doc {
    return [lhs, hardline, hardline, opKw, hardline, hardline, rhs];
}

/**
 * Statements one after another, with a blank line between them unless both are
 * "minor" — short bookkeeping lines (SET, DECLARE, GRANT, …) that read as a group.
 */
export function joinStatements(stmts: SqlNode[], isMinor: (node: SqlNode) => boolean, print: (node: SqlNode) => Doc): Doc[] {
    return stmts.flatMap((s, i): Doc[] => {
        if (i === 0) return [print(s)];
        return [isMinor(stmts[i - 1]!) && isMinor(s) ? hardline : [hardline, hardline], print(s)];
    });
}
