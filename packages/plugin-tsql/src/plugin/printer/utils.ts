import type { Doc, ParserOptions } from 'prettier';
import { builders } from 'prettier/doc';
import type { SqlNode } from '../parser/types.js';

const { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill } = builders;

export type Options = ParserOptions<SqlNode>;

/** SQL-specific options that Prettier passes through but doesn't know about. */
interface SqlOptions {
    sqlKeywordCase?: 'upper' | 'lower' | 'preserve';
    sqlDensity?: 'compact' | 'standard' | 'spacious';
    sqlCommaStyle?: 'trailing' | 'leading';
}

/** Cast opts once to access SQL-specific keys without repeated double-casts. */
function sqlOpts(opts: Options): SqlOptions {
    return opts as Options & SqlOptions;
}

/**
 * Apply the sqlKeywordCase option to a keyword string.
 * Prettier supplies the default value ('lower') from options.ts, so the
 * final toUpperCase() branch is only reached if the option is explicitly absent.
 */
export function keyword(kw: string, opts: Options): Doc {
    const { sqlKeywordCase } = sqlOpts(opts);
    if (sqlKeywordCase === 'lower') return kw.toLowerCase();
    if (sqlKeywordCase === 'preserve') return kw;
    return kw.toUpperCase();
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
