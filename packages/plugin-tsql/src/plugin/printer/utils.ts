import type { Doc, ParserOptions } from 'prettier';
import { builders } from 'prettier/doc';
import type { SqlNode } from '../parser/types.js';

const { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill } = builders;

export type Options = ParserOptions<SqlNode>;

/**
 * Apply the sqlKeywordCase option to a keyword string.
 * Prettier supplies the default value ('lower') from options.ts, so the
 * final toUpperCase() branch is only reached if the option is explicitly absent.
 */
export function keyword(kw: string, opts: Options): Doc {
    const c = (opts as unknown as Record<string, unknown>)['sqlKeywordCase'] as string | undefined;
    if (c === 'lower') return kw.toLowerCase();
    if (c === 'preserve') return kw;
    return kw.toUpperCase();
}

export function getDensity(opts: Options): 'compact' | 'standard' | 'spacious' {
    const d = (opts as unknown as Record<string, unknown>)['sqlDensity'] as string | undefined;
    if (d === 'compact' || d === 'spacious') return d;
    return 'standard';
}

export function getCommaStyle(opts: Options): 'trailing' | 'leading' {
    const c = (opts as unknown as Record<string, unknown>)['sqlCommaStyle'] as string | undefined;
    return c === 'leading' ? 'leading' : 'trailing';
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
