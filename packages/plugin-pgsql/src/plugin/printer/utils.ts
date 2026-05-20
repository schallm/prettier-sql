import type { Doc, ParserOptions } from 'prettier';
import { builders } from 'prettier/doc';
import type { SqlNode } from '../parser/types.js';

const { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill } = builders;

export type Options = ParserOptions<SqlNode>;

interface SqlOptions {
    sqlKeywordCase?: 'upper' | 'lower' | 'preserve';
    sqlDensity?: 'compact' | 'standard' | 'spacious';
    sqlCommaStyle?: 'trailing' | 'leading';
}

function sqlOpts(opts: Options): SqlOptions {
    return opts as Options & SqlOptions;
}

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

export function ifExistsDoc(ifExists: boolean, opts: Options): Doc {
    return ifExists ? [' ', keyword('IF EXISTS', opts)] : '';
}

export function onOffKw(isOn: boolean, opts: Options): Doc {
    return isOn ? keyword('ON', opts) : keyword('OFF', opts);
}

export function appendTrailingLines(doc: Doc, comment: string | undefined): Doc {
    if (!comment) return doc;
    return [doc, ...comment.split(/\r?\n/).flatMap((c): Doc[] => [hardline, c])];
}

export function commentsBlock(comments: string[] | undefined): Doc {
    if (!comments?.length) return '';
    return comments.flatMap((c): Doc[] => [hardline, c]);
}

export function parenList(items: Doc[]): Doc {
    return group(['(', indent([softline, join([',', line], items)]), softline, ')']);
}

export function aliasDoc(alias: string | null | undefined, opts: Options): Doc {
    return alias ? [' ', keyword('AS', opts), ' ', alias] : '';
}

export function hardSep(opts: Options): Doc {
    return getCommaStyle(opts) === 'leading' ? [hardline, ', '] : [',', hardline];
}

export function softSep(opts: Options): Doc {
    return getCommaStyle(opts) === 'leading' ? ifBreak([hardline, ', '], ', ') : [',', line];
}

export { hardline, join, indent, group, line, softline, lineSuffix, ifBreak, fill };
