import type { SupportLanguage } from 'prettier';

export const languages: SupportLanguage[] = [
    {
        name: 'T-SQL',
        parsers: ['tsql'],
        extensions: ['.sql', '.tsql'],
        vscodeLanguageIds: ['sql'],
    },
];
