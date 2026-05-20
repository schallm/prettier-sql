import type { SupportLanguage } from 'prettier';

export const languages: SupportLanguage[] = [
    {
        name: 'PostgreSQL',
        parsers: ['pgsql'],
        extensions: ['.sql', '.pgsql'],
        vscodeLanguageIds: ['sql'],
    },
];
