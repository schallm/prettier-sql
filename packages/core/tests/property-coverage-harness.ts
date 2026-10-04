import { describe, it, expect } from 'vitest';

/**
 * A parse-tree property the AST builder never reads is missing from the output, so
 * formatting silently changes the query — and the meaning check in the fixture harness
 * only notices when some fixture happens to use it. This catches every such property,
 * fixture or not (see PrettierSql.Core.PropertyCoverage).
 */
export interface PropertyCoverageConfig {
    /** The unread properties, as Type.Property, from the plugin's dotnet side. */
    unreadProperties: () => string[];
    /** A property the builder certainly reads, to show the scan works. */
    readProperty: string;
    /** The plugin's list file, for the failure messages. */
    listFile: string;
    /** Safe to leave unread, with why. */
    unused: Record<string, string>;
    /** Never set by the parser, with why. */
    unreachable: Record<string, string>;
    /** Known bugs: dropped from the output. */
    dropped: Record<string, string>;
}

export function registerPropertyCoverageTests(config: PropertyCoverageConfig): void {
    describe('parse tree property coverage', () => {
        const unread = config.unreadProperties();
        const listed = { ...config.unused, ...config.unreachable, ...config.dropped };

        it('finds the builder reads', () => {
            // a broken scan would report nothing (or everything) as unread
            expect(unread.length).toBeGreaterThan(0);
            expect(unread).not.toContain(config.readProperty);
        });

        it('lists every property the builder does not read', () => {
            const unlisted = unread.filter((p) => !(p in listed));
            expect(
                unlisted,
                `the AST builder drops these properties: build and print each one (with a fixture), ` +
                    `or list it in ${config.listFile} with the reason it is safe`,
            ).toEqual([]);
        });

        it('lists only properties the builder does not read', () => {
            const stale = Object.keys(listed).filter((p) => !unread.includes(p));
            expect(stale, `the builder reads these now: take them out of ${config.listFile}`).toEqual([]);
        });
    });
}
