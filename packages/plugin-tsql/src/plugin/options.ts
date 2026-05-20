import type { SupportOption } from 'prettier';

export const options: Record<string, SupportOption> = {
    sqlKeywordCase: {
        type: 'choice',
        category: 'SQL',
        default: 'lower',
        description: 'Casing for SQL keywords',
        choices: [
            { value: 'upper', description: 'UPPERCASE keywords' },
            { value: 'lower', description: 'lowercase keywords' },
            { value: 'preserve', description: 'Preserve original casing' },
        ],
    } as SupportOption,
    sqlDensity: {
        type: 'choice',
        category: 'SQL',
        default: 'standard',
        description: 'Controls how spread out the formatting is',
        choices: [
            { value: 'compact', description: 'Fits as much as possible on each line, wrapping at printWidth' },
            { value: 'standard', description: 'One clause per line; single predicates stay inline' },
            { value: 'spacious', description: 'Every predicate on its own line, even single ones' },
        ],
    } as SupportOption,
    sqlCommaStyle: {
        type: 'choice',
        category: 'SQL',
        default: 'trailing',
        description: 'Comma position in column lists (leading is not yet implemented)',
        choices: [
            { value: 'trailing', description: 'Trailing comma: col1,' },
            { value: 'leading', description: 'Leading comma: , col1 (not yet implemented — behaves as trailing)' },
        ],
    } as SupportOption,
};
