import type { Doc } from 'prettier';
import type { SqlNode } from '../types.js';
import {
    keyword, getDensity, getCommaStyle, commaFill, hasHardline, hasLine, hasLineSuffix, hardSep, softSep,
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

/** A CASE's result: `nested` when it is itself a CASE, which starts on a line of its own. */
export interface CaseResult {
    doc: Doc;
    nested: boolean;
}

/** One `WHEN cond THEN result`; `boolChain` when cond is an AND/OR of several predicates. */
export interface CaseWhen {
    when: Doc;
    then: CaseResult;
    boolChain: boolean;
}

/**
 * `CASE [input] WHEN … THEN … ELSE … END`, each arm on its own indented line. In a searched
 * CASE (no input), an AND/OR condition — or any condition in spacious density — goes on
 * indented lines of its own under WHEN, with THEN on the line after it. A nested CASE as a
 * result starts on an indented line after THEN / ELSE.
 */
export function caseDoc(input: Doc | null, whens: CaseWhen[], elseResult: CaseResult | null, opts: Options): Doc {
    const kw = (k: string): Doc => keyword(k, opts);
    const result = (head: Doc, r: CaseResult): Doc => (r.nested ? [head, indent([hardline, r.doc])] : [head, ' ', r.doc]);
    const breakWhen = input === null && getDensity(opts) === 'spacious';
    const arms = whens.map((w): Doc => {
        if (input === null && (w.boolChain || breakWhen)) return [kw('WHEN'), indent([hardline, w.when]), hardline, result(kw('THEN'), w.then)];
        return w.then.nested ? [kw('WHEN'), ' ', w.when, ' ', result(kw('THEN'), w.then)] : caseArm([kw('WHEN'), ' ', w.when], [kw('THEN'), ' ', w.then.doc]);
    });
    const elseArm: Doc = !elseResult ? '' : elseResult.nested ? [hardline, result(kw('ELSE'), elseResult)] : [hardline, caseArm(kw('ELSE'), elseResult.doc)];
    return group([kw('CASE'), input ? [' ', input] : '', indent([...arms.map((a): Doc => [hardline, a]), elseArm]), hardline, kw('END')]);
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

/**
 * One predicate of an AND / OR chain, after the operator that joins it to the one before
 * (the first one's `op` is unused). `breakBefore` forces it onto a new line — after a
 * comment that sits between two predicates, appended to the previous one's doc.
 */
export interface BoolTerm {
    op: 'AND' | 'OR';
    doc: Doc;
    breakBefore?: boolean;
}

function termDoc(t: BoolTerm, opts: Options): Doc {
    return [keyword(t.op, opts), ' ', t.doc];
}

/** An AND / OR chain one predicate to a line, for a clause that supplies the indent (WHERE, HAVING). */
export function boolLines(terms: BoolTerm[], opts: Options): Doc {
    return terms.map((t, i): Doc => (i === 0 ? t.doc : [hardline, termDoc(t, opts)]));
}

/** An AND / OR chain on one line when it fits; otherwise each further predicate on an indented line. */
export function boolGroup(terms: BoolTerm[], opts: Options): Doc {
    const [first, ...rest] = terms;
    return group([first?.doc ?? '', indent(rest.map((t): Doc => [t.breakBefore ? hardline : line, termDoc(t, opts)]))]);
}

/** An AND / OR chain packed as many predicates to a line as fit, each kept whole. */
function boolFill(terms: BoolTerm[], opts: Options): Doc {
    return fill(terms.flatMap((t, i): Doc[] => (i === 0 ? [t.doc] : [t.breakBefore ? hardline : line, termDoc(t, opts)])));
}

/**
 * `WHERE` / `HAVING` and its predicates. A single predicate stays on the keyword's line
 * (except in spacious density). Several go on indented lines: one to a line, or packed in
 * compact density, where the whole condition stays on the keyword's line when it fits.
 */
export function boolClauseDoc(kw: string, terms: BoolTerm[], opts: Options): Doc {
    const density = getDensity(opts);
    const kwDoc = keyword(kw, opts);
    if (terms.length === 1) return density === 'spacious' ? [kwDoc, indent([hardline, terms[0]!.doc])] : [kwDoc, ' ', terms[0]!.doc];
    if (density === 'compact') return [kwDoc, group(indent([line, boolFill(terms, opts)]))];
    return [kwDoc, indent([hardline, boolLines(terms, opts)])];
}

/**
 * `ON condition` of a join. An AND / OR chain follows ON, its further predicates on
 * indented lines when it doesn't fit; a single predicate that doesn't fit moves whole to an
 * indented line of its own — unless it spans lines anyway (a subquery), when it stays put.
 */
export function joinOnDoc(kw: Doc, condition: Doc, isChain: boolean): Doc {
    if (isChain || hasHardline(condition)) return [kw, ' ', condition];
    return [kw, group(indent([line, condition]))];
}

/** `(a OR b)` as an operand: inline when it fits, otherwise the chain on indented lines between the parentheses. */
export function parenGroup(doc: Doc): Doc {
    return group(['(', indent([softline, doc]), softline, ')']);
}

/**
 * `SELECT` and its columns. One column stays on the SELECT line (except in spacious
 * density) — in standard density, unless it spans lines (a CASE), when it starts on a line
 * of its own like a list. In compact density several columns pack after SELECT; otherwise
 * they go one to a line, indented.
 */
export function selectListDoc(selectKw: Doc, columns: Doc[], opts: Options, spansLines = false): Doc {
    const density = getDensity(opts);
    if (columns.length === 1 && (density === 'compact' || (density === 'standard' && !spansLines))) return [selectKw, ' ', columns[0]!];
    if (density === 'compact') return [selectKw, ' ', indent(commaFill(columns))];
    return [selectKw, indent([hardline, join(hardSep(opts), columns)])];
}

/**
 * `FROM` and its table references. A single table without joins stays on the FROM line
 * (except in spacious density). Otherwise each reference — and each join, in standard and
 * spacious density — goes on an indented line; compact keeps them on the FROM line when they fit.
 */
export function fromClauseDoc(kw: Doc, items: Doc[], hasJoin: boolean, opts: Options): Doc {
    const density = getDensity(opts);
    if (density === 'compact') return [kw, ' ', group(indent(join(softSep(opts), items)))];
    if (density === 'standard' && items.length === 1 && !hasJoin) return [kw, ' ', items[0]!];
    return [kw, indent([hardline, join(hardSep(opts), items)])];
}

/**
 * A keyword and a list (GROUP BY, ORDER BY, RETURNING, USING). One item stays on the
 * keyword's line (except in spacious density); several go one to an indented line, or
 * packed in compact density, on the keyword's line when they fit.
 */
export function listClauseDoc(kw: Doc, items: Doc[], opts: Options): Doc {
    const density = getDensity(opts);
    if (density !== 'spacious' && items.length === 1) return [kw, ' ', items[0]!];
    if (density === 'compact') return [kw, group(indent([line, commaFill(items)]))];
    return [kw, indent([hardline, join(hardSep(opts), items)])];
}

/** The items of a PARTITION BY / ORDER BY inside a window: a long list continues on indented lines. */
export function clauseItems(items: Doc[]): Doc {
    return group(indent(join([',', line], items)));
}

/** A window specification's `(…)`: inline when it fits, otherwise each of its clauses on its own line. */
export function windowSpecDoc(clauses: Doc[]): Doc {
    if (clauses.length === 0) return '()';
    return group(['(', indent([softline, join(line, clauses)]), softline, ')']);
}

/** `WINDOW w AS (…)`: a single definition stays on the WINDOW line, several go one to an indented line. */
export function windowClauseDoc(kw: Doc, defs: Doc[], opts: Options): Doc {
    if (defs.length === 1) return [kw, ' ', defs[0]!];
    return [kw, indent([hardline, join(hardSep(opts), defs)])];
}

/** `WITH` and its common table expressions, one to an indented line. */
export function withClauseDoc(withKw: Doc, ctes: Doc[], opts: Options): Doc {
    return [withKw, indent([hardline, join(hardSep(opts), ctes)])];
}

/**
 * A subquery in an expression — `(SELECT …)` after IN, a comparison, or as a value — on
 * lines of its own; in compact density, inline when it fits.
 */
export function subqueryDoc(query: Doc, opts: Options): Doc {
    const brk = getDensity(opts) === 'compact' ? softline : hardline;
    return group(['(', indent([brk, query]), brk, ')']);
}

/**
 * `THEN action` of a MERGE's `WHEN …` clause: the action on an indented line of its own,
 * or on the THEN line in compact density.
 */
export function mergeActionDoc(thenKw: Doc, action: Doc, opts: Options): Doc {
    return getDensity(opts) === 'compact' ? [thenKw, ' ', action] : [thenKw, indent([hardline, action])];
}

/**
 * `CREATE INDEX name ON table (columns)` and its tail (INCLUDE, WITH, WHERE, …).
 * `ON table (` follows the name when it fits — `headText` is the plain text up to and
 * including that `(`, for the length check — and otherwise moves to an indented line.
 * The tail follows on the same line when it all fits, otherwise each part goes on an
 * indented line of its own.
 */
export function createIndexDoc(head: Doc, headText: string, on: Doc, tail: Doc[], opts: Options): Doc {
    return [
        head,
        headText.length > opts.printWidth ? indent([hardline, on]) : [' ', on],
        tail.length > 0 ? group(indent(tail.map((c): Doc => [line, c]))) : '',
        ';',
    ];
}

/** `ALTER TABLE t` and its actions, the actions on indented lines below it. */
export function alterTableDoc(header: Doc, actions: Doc[], opts: Options): Doc {
    return [header, indent([hardline, join([',', hardline], actions)]), ';'];
}

/**
 * `[CONSTRAINT name] clause clause …` (FOREIGN KEY (…) REFERENCES … ON DELETE …, or
 * CHECK (…)): on one line when it fits, otherwise the name on its own line and each
 * clause on an indented line below it.
 */
export function constraintDoc(name: Doc | null, clauses: Doc[], opts: Options): Doc {
    const [first, ...rest] = name ? [[keyword('CONSTRAINT', opts), ' ', name], ...clauses] : clauses;
    return group([first ?? '', indent(rest.map((c): Doc => [line, c]))]);
}

/** `CHECK (condition)`: the condition on indented lines between the parentheses when it doesn't fit. */
export function checkDoc(kw: Doc, condition: Doc): Doc {
    return [kw, ' ', parenGroup(condition)];
}

/**
 * `GRANT privileges` followed by its clauses (ON …, TO …, WITH GRANT OPTION, …), each on
 * a line of its own. The privileges follow the verb when they fit, otherwise they pack
 * onto indented lines below it.
 */
export function grantDoc(verb: Doc, privileges: Doc[], clauses: Doc[]): Doc {
    return [group([verb, indent([line, commaFill(privileges)])]), clauses.map((c): Doc => [hardline, c]), ';'];
}

/** A statement header followed by its options one to an indented line (CREATE / ALTER SEQUENCE). */
export function optionLinesDoc(header: Doc, options: Doc[]): Doc {
    return [header, indent(options.map((o): Doc => [hardline, o])), ';'];
}

/**
 * A statement defined by a query — `CREATE VIEW v AS`, `CREATE TABLE t AS`,
 * `DECLARE c CURSOR FOR` — with AS / FOR on a line of its own and the query below it.
 */
export function asQueryDoc(header: Doc, kw: Doc, query: Doc): Doc {
    return [header, hardline, kw, hardline, query];
}

/**
 * `DROP kind name, name … [ON …] [CASCADE];`: on one line when it fits; otherwise the names
 * fill an indented line and each clause follows on a line of its own. When no clause
 * follows the names, the `;` goes into the last one, so the line filling counts it.
 */
export function dropDoc(head: Doc, names: Doc[], clauses: Doc[]): Doc {
    const namesEnd = names.length > 0 && clauses.length === 0;
    // A single name that breaks on its own (`ix ON t WITH (…)`) stays on the DROP line
    const hug = names.length === 1 && hasLine(names[0]!);
    return [
        group([
            head,
            hug ? [' ', names[0]!, namesEnd ? ';' : ''] : names.length > 0 ? indent([line, commaFill(names, namesEnd ? ';' : '')]) : '',
            clauses.map((c): Doc => [line, c]),
        ]),
        namesEnd ? '' : ';',
    ];
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
