import type { Doc, ParserOptions } from 'prettier';
import { builders } from 'prettier/doc';
import type { SqlNode } from '../parser/types.js';

const { hardline, join, indent, group, line, softline, trim, ifBreak } = builders;

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

/** Emit a top-level SQL clause: KEYWORD\n    body */
export function clause(kw: string, body: Doc, opts: Options): Doc {
    return group([keyword(kw, opts), indent([hardline, body])]);
}

export { hardline, join, indent, group, line, softline, trim, ifBreak, builders };
