import type { Doc, ParserOptions } from 'prettier';
import { builders, utils } from 'prettier/doc';
import type { SqlNode } from '../types.js';

const { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill } = builders;

export type Options = ParserOptions<SqlNode>;

/** SQL-specific options that Prettier passes through but doesn't know about. */
type SqlOptions = {
    sqlKeywordCase?: 'upper' | 'lower' | 'preserve';
    sqlDensity?: 'compact' | 'standard' | 'spacious';
    sqlCommaStyle?: 'trailing' | 'leading';
};

/** Cast opts once to access SQL-specific keys without repeated double-casts. */
function sqlOpts(opts: Options): SqlOptions {
    return opts as SqlOptions;
}

/** Function type for recursively printing a SqlNode to a Doc. */
export type PrintFn = (node: SqlNode) => Doc;

// Keywords common enough to show which case a file is written in.
const STYLE_KEYWORDS = new Set([
    'select', 'from', 'where', 'and', 'or', 'not', 'null', 'is', 'in', 'as', 'on', 'join',
    'inner', 'left', 'right', 'outer', 'group', 'by', 'order', 'having', 'insert', 'into',
    'values', 'update', 'set', 'delete', 'create', 'alter', 'drop', 'table', 'view', 'index',
    'with', 'case', 'when', 'then', 'else', 'end', 'begin', 'declare', 'exec', 'execute',
    'return', 'if', 'exists', 'union', 'all', 'distinct', 'between', 'like', 'limit', 'top',
]);

let styleCache: { text: string; style: 'upper' | 'lower' } | undefined;

/**
 * The keyword case a file is written in, for sqlKeywordCase: 'preserve'. Keywords are
 * rebuilt from constants when printing, so the source spelling of each one isn't
 * available — instead, count how the common keywords in the input are written
 * (outside comments, strings and quoted names) and use the majority case throughout.
 */
function keywordStyleOf(text: string): 'upper' | 'lower' {
    if (styleCache?.text === text) return styleCache.style;
    const code = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|\[[^\]]*\]/g, ' ');
    let upper = 0;
    let lower = 0;
    for (const word of code.match(/\b[A-Za-z_]+\b/g) ?? []) {
        if (!STYLE_KEYWORDS.has(word.toLowerCase())) continue;
        if (word === word.toUpperCase()) upper++;
        else if (word === word.toLowerCase()) lower++;
    }
    const style = upper > lower ? 'upper' : 'lower';
    styleCache = { text, style };
    return style;
}

/**
 * Apply the sqlKeywordCase option to a keyword string.
 * Prettier supplies the default value ('lower') from options.ts, so the
 * final toUpperCase() branch is only reached if the option is explicitly absent.
 */
export function keyword(kw: string, opts: Options): Doc {
    let { sqlKeywordCase } = sqlOpts(opts);
    if (sqlKeywordCase === 'preserve') sqlKeywordCase = keywordStyleOf(opts.originalText ?? '');
    const recase = sqlKeywordCase === 'lower'
        ? (s: string) => s.toLowerCase()
        : (s: string) => s.toUpperCase();
    // Strings passed through here may embed case-sensitive parts: double-quoted
    // identifiers in function and type names, single-quoted literals in option strings
    // such as `PASSWORD 'Secret'`, and T-SQL @variables in hints such as
    // `OPTIMIZE FOR (@p = 1)`. Recase only the text outside those.
    if (!/["'@]/.test(kw)) return recase(kw);
    return kw.replace(/("(?:[^"]|"")*"|'(?:[^']|'')*'|@[\w@#$]*)|[^"'@]+/g, (m, kept) => (kept ? m : recase(m)));
}

export function getDensity(opts: Options): 'compact' | 'standard' | 'spacious' {
    const { sqlDensity } = sqlOpts(opts);
    if (sqlDensity === 'compact' || sqlDensity === 'spacious') return sqlDensity;
    return 'standard';
}

export function getCommaStyle(opts: Options): 'trailing' | 'leading' {
    return sqlOpts(opts).sqlCommaStyle === 'leading' ? 'leading' : 'trailing';
}

/** Emit ` IF EXISTS` when the flag is set, or an empty string. */
export function ifExistsDoc(ifExists: boolean, opts: Options): Doc {
    return ifExists ? [' ', keyword('IF EXISTS', opts)] : '';
}

/** Emit `ON` or `OFF` keyword based on a boolean flag. */
export function onOffKw(isOn: boolean, opts: Options): Doc {
    return isOn ? keyword('ON', opts) : keyword('OFF', opts);
}

/**
 * Append the lines of a multi-line block comment to a doc, each on its own hardline.
 * Used when a trailing block comment must follow its node rather than sit on the same line.
 */
export function appendTrailingLines(doc: Doc, comment: string | undefined): Doc {
    if (!comment) return doc;
    return [doc, ...comment.split(/\r?\n/).flatMap((c): Doc[] => [hardline, c])];
}

/**
 * Emit a list of comments each preceded by a hardline.
 * Used for leadingComments / preBodyComments / postParamComments arrays.
 */
export function commentsBlock(comments: string[] | undefined): Doc {
    if (!comments?.length) return '';
    return comments.flatMap((c): Doc[] => [hardline, c]);
}

/**
 * Render `( a, b, c )` as a soft-wrapped group: stays inline when it fits,
 * each item on its own indented line when it doesn't.
 */
export function parenList(items: Doc[]): Doc {
    return group(['(', indent([softline, join([',', line], items)]), softline, ')']);
}

/**
 * True when a doc contains a line comment waiting for the end of its line (a
 * lineSuffix). Nothing may follow it on that line, or it becomes part of the comment.
 */
export function hasLineSuffix(doc: Doc): boolean {
    if (Array.isArray(doc)) return doc.some(hasLineSuffix);
    if (!doc || typeof doc !== 'object') return false;
    if (doc.type === 'line-suffix') return true;
    const d = doc as { contents?: Doc; parts?: Doc[]; breakContents?: Doc; flatContents?: Doc };
    return [d.contents, d.breakContents, d.flatContents, ...(d.parts ?? [])].some((c) => c !== undefined && hasLineSuffix(c));
}

/**
 * Fill-pack a comma-separated list: as many items per line as fit. An item ending in a
 * line comment always ends its line, so the next item can't land inside the comment.
 */
export function commaFill(items: Doc[]): Doc {
    return fill(items.flatMap((d, i) => (i === 0 ? [d] : [[',', hasLineSuffix(items[i - 1]!) ? hardline : line], d])));
}

/**
 * The `(a, b, c)` of a call or list: inline when it fits, otherwise one item per line
 * between the parentheses (compact density, or `packed`, fills several per line).
 * Fewer than two items, or an item that already contains a forced break (a CASE, a
 * subquery), keep the parentheses hugging them, so `sum(case ... end)` stays as it is.
 */
export function parenItems(items: Doc[], opts: Options, packed = false): Doc {
    if (items.length < 2 || items.some((i) => utils.willBreak(i))) return ['(', join(', ', items), ')'];
    const inner = packed || getDensity(opts) === 'compact' ? commaFill(items) : joinItems(items);
    return group(['(', indent([softline, inner]), softline, ')']);
}

function joinItems(items: Doc[]): Doc {
    return items.flatMap((d, i): Doc[] => (i === 0 ? [d] : [[',', hasLineSuffix(items[i - 1]!) ? hardline : line], d]));
}

/**
 * Like parenList but uses fill-packing — multiple items per line when they fit,
 * wrapping to the next line only when needed. Use in compact density.
 */
export function parenListFill(items: Doc[]): Doc {
    return group([
        '(',
        indent([softline, commaFill(items)]),
        softline,
        ')',
    ]);
}

/**
 * Render ` AS alias` when alias is set, or an empty string.
 */
export function aliasDoc(alias: string | null | undefined, opts: Options): Doc {
    return alias ? [' ', keyword('AS', opts), ' ', alias] : '';
}

/**
 * Separator for hardline-broken lists (standard/spacious density).
 * trailing: `[',', hardline]`  leading: `[hardline, ', ']`
 */
export function hardSep(opts: Options): Doc {
    return getCommaStyle(opts) === 'leading' ? [hardline, ', '] : [',', hardline];
}

/**
 * Separator for conditionally-broken lists (compact density / inline groups).
 * trailing: `[',', line]`  leading: `ifBreak([hardline, ', '], ', ')`
 */
export function softSep(opts: Options): Doc {
    return getCommaStyle(opts) === 'leading' ? ifBreak([hardline, ', '], ', ') : [',', line];
}

export { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill };
