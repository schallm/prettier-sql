import { describe, it, expect } from 'vitest';
import { unreadProperties } from '../src/plugin/parser/index.js';
import { unused, unreachable, dropped } from './unread-properties.js';

// A ScriptDom property the builder never reads is missing from the output, so formatting
// silently changes the query — and the meaning check in the fixture harness only notices
// when some fixture happens to use it. This catches every such property, fixture or not.
describe('ScriptDom property coverage', () => {
    const unread = unreadProperties();
    const listed = { ...unused, ...unreachable, ...dropped };

    it('finds the builder reads', () => {
        // a broken scan would report nothing (or everything) as unread
        expect(unread.length).toBeGreaterThan(0);
        expect(unread).not.toContain('FunctionCall.FunctionName');
    });

    it('lists every property the builder does not read', () => {
        const unlisted = unread.filter((p) => !(p in listed));
        expect(
            unlisted,
            'AstBuilder.cs drops these ScriptDom properties: build and print each one (with a fixture), ' +
                'or list it in tests/unread-properties.ts with the reason it is safe',
        ).toEqual([]);
    });

    it('lists only properties the builder does not read', () => {
        const stale = Object.keys(listed).filter((p) => !unread.includes(p));
        expect(stale, 'the builder reads these now: take them out of tests/unread-properties.ts').toEqual([]);
    });
});
