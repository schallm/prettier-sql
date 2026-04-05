import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, hardline, join, indent, group, line, softline, ifExistsDoc } from './utils.js';
import { propStr, propBool } from './helpers.js';

// ---------------------------------------------------------------------------
// DROP DATABASE
// ---------------------------------------------------------------------------

export function printDropDatabase(node: SqlNode, opts: Options): Doc {
    const databases = node.props?.['databases'] as string[] | undefined;
    const ifExists = propBool(node, 'ifExists');

    const dbList: Doc = databases?.length ? join([', '], databases) : '';
    return [keyword('DROP DATABASE', opts), ifExistsDoc(ifExists, opts), ' ', dbList, ';'];
}

// ---------------------------------------------------------------------------
// DBCC
// ---------------------------------------------------------------------------

export function printDbcc(node: SqlNode, opts: Options): Doc {
    const command = propStr(node, 'command') ?? '';
    const literals = node.props?.['literals'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const optionsUseJoin = propBool(node, 'optionsUseJoin');

    const argPart: Doc = literals?.length ? ['(', join([', '], literals), ')'] : '';

    const optSep = optionsUseJoin ? ' JOIN ' : ', ';
    const withPart: Doc = options?.length
        ? [
              ' ',
              keyword('WITH', opts),
              ' ',
              join(
                  [optSep],
                  options.map((o) => keyword(o, opts)),
              ),
          ]
        : '';

    return [keyword('DBCC', opts), ' ', keyword(command, opts), argPart, withPart, ';'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOVE_OPT_RE = /^(MOVE)\s+(.*?)\s+(TO)\s+(.+)$/i;

// Applies keyword casing to an option/device string like "NOFORMAT", "DISK = N'...'",
// "STATS = 10", or "MOVE N'...' TO N'...'". Only the keyword portions are cased;
// string literals and numeric values are emitted verbatim.
function kwOpt(opt: string, opts: Options): Doc {
    const eqIdx = opt.indexOf(' = ');
    if (eqIdx >= 0) {
        return [keyword(opt.slice(0, eqIdx), opts), ' = ', opt.slice(eqIdx + 3)];
    }
    // MOVE N'logical' TO N'physical' — keyword MOVE and TO, literals verbatim
    const moveMatch = opt.match(MOVE_OPT_RE);
    if (moveMatch) {
        return [keyword(moveMatch[1], opts), ' ', moveMatch[2], ' ', keyword(moveMatch[3], opts), ' ', moveMatch[4]];
    }
    // Guard: if the string starts with a literal, don't try to keyword-case it
    if (opt.startsWith("N'") || opt.startsWith("'")) return opt;
    return keyword(opt, opts);
}

// ---------------------------------------------------------------------------
// BACKUP DATABASE / LOG
// ---------------------------------------------------------------------------

function printBackupBase(verb: Doc, node: SqlNode, opts: Options): Doc {
    const database = propStr(node, 'database') ?? '';
    const devices = node.props?.['devices'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const mirrorTo = node.props?.['mirrorTo'] as string[] | undefined;

    const toPart: Doc = devices?.length
        ? [
              hardline,
              keyword('TO', opts),
              ' ',
              join(
                  [',', hardline],
                  devices.map((d) => kwOpt(d, opts)),
              ),
          ]
        : '';

    const mirrorParts: Doc[] =
        mirrorTo?.map((m) => [hardline, keyword('MIRROR TO', opts), ' ', kwOpt(m, opts)] as Doc) ?? [];

    const withPart: Doc = options?.length
        ? [
              hardline,
              group([
                  keyword('WITH', opts),
                  indent([
                      line,
                      join(
                          [',', line],
                          options.map((o) => kwOpt(o, opts)),
                      ),
                  ]),
              ]),
          ]
        : '';

    return group([verb, ' ', database, indent([toPart, ...mirrorParts, withPart]), ';']);
}

export function printBackupDatabase(node: SqlNode, opts: Options): Doc {
    return printBackupBase(keyword('BACKUP DATABASE', opts), node, opts);
}

export function printBackupLog(node: SqlNode, opts: Options): Doc {
    return printBackupBase(keyword('BACKUP LOG', opts), node, opts);
}

// ---------------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------------

export function printRestore(node: SqlNode, opts: Options): Doc {
    const kind = propStr(node, 'kind') ?? 'DATABASE';
    const database = propStr(node, 'database');
    const devices = node.props?.['devices'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;

    const dbPart: Doc = database ? [' ', database] : '';

    const fromPart: Doc = devices?.length
        ? [
              hardline,
              keyword('FROM', opts),
              ' ',
              join(
                  [',', hardline],
                  devices.map((d) => kwOpt(d, opts)),
              ),
          ]
        : '';

    const withPart: Doc = options?.length
        ? [
              hardline,
              group([
                  keyword('WITH', opts),
                  indent([
                      line,
                      join(
                          [',', line],
                          options.map((o) => kwOpt(o, opts)),
                      ),
                  ]),
              ]),
          ]
        : '';

    return group([keyword('RESTORE', opts), ' ', keyword(kind, opts), dbPart, indent([fromPart, withPart]), ';']);
}

// ---------------------------------------------------------------------------
// CREATE DATABASE
// ---------------------------------------------------------------------------

export function printCreateDatabase(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const collation = propStr(node, 'collation');
    const snapshot = propStr(node, 'snapshot');
    const copyOf = propStr(node, 'copyOf');
    const fileGroups = node.props?.['fileGroups'] as string[] | undefined;
    const logOn = node.props?.['logOn'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;

    const parts: Doc[] = [keyword('CREATE DATABASE', opts), ' ', name];

    if (collation) parts.push(' ', keyword('COLLATE', opts), ' ', collation);
    if (snapshot) parts.push(' ', keyword('AS SNAPSHOT OF', opts), ' ', snapshot);
    if (copyOf) parts.push(' ', keyword('AS COPY OF', opts), ' ', copyOf);
    if (fileGroups?.length) {
        parts.push(hardline, keyword('ON', opts), ' ');
        parts.push(indent([hardline, join([',', hardline], fileGroups)]));
    }
    if (logOn?.length) {
        parts.push(hardline, keyword('LOG ON', opts), ' ');
        parts.push(indent([hardline, join([',', hardline], logOn)]));
    }
    if (options?.length)
        parts.push(
            hardline,
            join(
                [',', hardline],
                options.map((o) => kwOpt(o, opts)),
            ),
        );

    parts.push(';');
    return group(parts);
}

// ---------------------------------------------------------------------------
// ALTER DATABASE helpers
// ---------------------------------------------------------------------------

function alterDb(node: SqlNode, opts: Options): Doc {
    const db = propStr(node, 'database') ?? '';
    return db === 'CURRENT' ? keyword('CURRENT', opts) : db;
}

function alterDbHeader(node: SqlNode, opts: Options): Doc {
    return [keyword('ALTER DATABASE', opts), ' ', alterDb(node, opts)];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE SET
// ---------------------------------------------------------------------------

export function printAlterDatabaseSet(node: SqlNode, opts: Options): Doc {
    const options = node.props?.['options'] as string[] | undefined;
    const termination = propStr(node, 'termination');

    const optPart: Doc = options?.length
        ? group([
              indent([
                  softline,
                  join(
                      [',', line],
                      options.map((o) => keyword(o, opts)),
                  ),
              ]),
          ])
        : '';
    const termPart: Doc = termination ? [' ', keyword(termination, opts)] : '';

    return group([alterDbHeader(node, opts), hardline, keyword('SET', opts), ' ', optPart, termPart, ';']);
}

// ---------------------------------------------------------------------------
// ALTER DATABASE COLLATE
// ---------------------------------------------------------------------------

export function printAlterDatabaseCollate(node: SqlNode, opts: Options): Doc {
    const collation = propStr(node, 'collation') ?? '';
    return [alterDbHeader(node, opts), ' ', keyword('COLLATE', opts), ' ', collation, ';'];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE MODIFY NAME
// ---------------------------------------------------------------------------

export function printAlterDatabaseModifyName(node: SqlNode, opts: Options): Doc {
    const newName = propStr(node, 'newName') ?? '';
    return [alterDbHeader(node, opts), ' ', keyword('MODIFY NAME', opts), ' = ', newName, ';'];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE SCOPED CONFIGURATION
// ---------------------------------------------------------------------------

export function printAlterDatabaseScopedConfigSet(node: SqlNode, opts: Options): Doc {
    const option = propStr(node, 'option') ?? '';
    const secondary = propBool(node, 'secondary');
    const forSec: Doc = secondary ? [keyword('FOR SECONDARY', opts), ' '] : '';
    return [
        keyword('ALTER DATABASE SCOPED CONFIGURATION', opts),
        ' ',
        forSec,
        keyword('SET', opts),
        ' ',
        keyword(option, opts),
        ';',
    ];
}

export function printAlterDatabaseScopedConfigClear(node: SqlNode, opts: Options): Doc {
    const option = propStr(node, 'option') ?? '';
    const secondary = propBool(node, 'secondary');
    const forSec: Doc = secondary ? [keyword('FOR SECONDARY', opts), ' '] : '';
    return [
        keyword('ALTER DATABASE SCOPED CONFIGURATION', opts),
        ' ',
        forSec,
        keyword('CLEAR', opts),
        ' ',
        keyword(option, opts),
        ';',
    ];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE ADD / REMOVE / MODIFY FILE and FILEGROUP
// ---------------------------------------------------------------------------

/** Apply sqlKeywordCase to the well-known keywords inside a file-spec string
 *  (NAME, FILENAME, SIZE, MAXSIZE, FILEGROWTH, UNLIMITED, KB, MB, GB, TB).
 *  Quoted strings and bare identifiers are left untouched. */
function caseFileSpec(spec: string, opts: Options): string {
    const kw = (m: string) => keyword(m, opts) as string;
    return spec
        .replace(/\b(FILENAME|FILEGROWTH|MAXSIZE|UNLIMITED|NAME|SIZE|OFFLINE|KB|MB|GB|TB)\b/gi, kw)
        .replace(/(\d)(KB|MB|GB|TB)\b/gi, (_, digit, unit) => digit + kw(unit));
}

export function printAlterDatabaseAddFile(node: SqlNode, opts: Options): Doc {
    const fileGroup = propStr(node, 'fileGroup');
    const isLog = propBool(node, 'isLog');
    const files = node.props?.['files'] as string[] | undefined;

    const clause: Doc = isLog ? keyword('ADD LOG FILE', opts) : keyword('ADD FILE', opts);
    const toFg: Doc = fileGroup ? [' ', keyword('TO FILEGROUP', opts), ' ', fileGroup] : '';
    const filesDoc: Doc = files?.length
        ? [
              '(',
              indent([
                  hardline,
                  join(
                      [',', hardline],
                      files.map((f) => caseFileSpec(f, opts)),
                  ),
              ]),
              hardline,
              ')',
          ]
        : '()';

    return group([alterDbHeader(node, opts), hardline, clause, ' ', filesDoc, toFg, ';']);
}

export function printAlterDatabaseAddFileGroup(node: SqlNode, opts: Options): Doc {
    const fileGroup = propStr(node, 'fileGroup') ?? '';
    const containsFileStream = propBool(node, 'containsFileStream');
    const containsMemOptimized = propBool(node, 'containsMemoryOptimized');

    const suffix: Doc = containsFileStream
        ? [' ', keyword('CONTAINS FILESTREAM', opts)]
        : containsMemOptimized
          ? [' ', keyword('CONTAINS MEMORY_OPTIMIZED_DATA', opts)]
          : '';

    return [alterDbHeader(node, opts), ' ', keyword('ADD FILEGROUP', opts), ' ', fileGroup, suffix, ';'];
}

export function printAlterDatabaseRemoveFile(node: SqlNode, opts: Options): Doc {
    const file = propStr(node, 'file') ?? '';
    return [alterDbHeader(node, opts), ' ', keyword('REMOVE FILE', opts), ' ', file, ';'];
}

export function printAlterDatabaseRemoveFileGroup(node: SqlNode, opts: Options): Doc {
    const fileGroup = propStr(node, 'fileGroup') ?? '';
    return [alterDbHeader(node, opts), ' ', keyword('REMOVE FILEGROUP', opts), ' ', fileGroup, ';'];
}

export function printAlterDatabaseModifyFile(node: SqlNode, opts: Options): Doc {
    const file = caseFileSpec(propStr(node, 'file') ?? '', opts);
    return group([alterDbHeader(node, opts), hardline, keyword('MODIFY FILE', opts), ' (', file, ')', ';']);
}

export function printAlterDatabaseModifyFileGroup(node: SqlNode, opts: Options): Doc {
    const fileGroup = propStr(node, 'fileGroup') ?? '';
    const makeDefault = propBool(node, 'makeDefault');
    const option = propStr(node, 'option');

    const action: Doc = makeDefault ? keyword('DEFAULT', opts) : keyword(option ?? '', opts);
    return [alterDbHeader(node, opts), ' ', keyword('MODIFY FILEGROUP', opts), ' ', fileGroup, ' ', action, ';'];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE REBUILD LOG
// ---------------------------------------------------------------------------

export function printAlterDatabaseRebuildLog(node: SqlNode, opts: Options): Doc {
    const file = propStr(node, 'file');
    const onPart: Doc = file ? [' ', keyword('ON', opts), ' (', caseFileSpec(file, opts), ')'] : '';
    return [alterDbHeader(node, opts), ' ', keyword('REBUILD LOG', opts), onPart, ';'];
}
