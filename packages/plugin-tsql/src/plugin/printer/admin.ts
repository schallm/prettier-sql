import type { Doc } from 'prettier';
import type { SqlNode } from '@prettier-sql/core/types';
import type { Options } from '@prettier-sql/core/printer/utils';
import { keyword, hardline, join, indent, group, line, softline, ifExistsDoc, optionItems } from '@prettier-sql/core/printer/utils';
import { splitTopLevel } from './helpers.js';
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
    // ENCRYPTION (ALGORITHM = AES_256, SERVER CERTIFICATE = name): the key name keeps its case
    const enc = /^ENCRYPTION \(ALGORITHM = (\w+), (SERVER CERTIFICATE|SERVER ASYMMETRIC KEY) = (.+)\)$/.exec(opt);
    if (enc) {
        return [
            keyword('ENCRYPTION', opts), ' ',
            group([
                '(',
                indent([
                    softline, keyword('ALGORITHM', opts), ' = ', keyword(enc[1]!, opts), ',', line,
                    keyword(enc[2]!, opts), ' = ', enc[3]!,
                ]),
                softline, ')',
            ]),
        ];
    }
    // STOPATMARK = 'mark' [AFTER 'datetime'] / STOPBEFOREMARK = ...
    const stop = /^(STOPATMARK|STOPBEFOREMARK) = ((?:N?'(?:[^']|'')*'|[^ ]+))(?: AFTER (.+))?$/.exec(opt);
    if (stop) {
        return [keyword(stop[1]!, opts), ' = ', stop[2]!, stop[3] ? [' ', keyword('AFTER', opts), ' ', stop[3]] : ''];
    }
    // FILESTREAM (DIRECTORY_NAME = 'dir')
    const fileStream = /^FILESTREAM \(DIRECTORY_NAME = (.+)\)$/.exec(opt);
    if (fileStream) return [keyword('FILESTREAM', opts), ' (', keyword('DIRECTORY_NAME', opts), ' = ', fileStream[1]!, ')'];
    const eqIdx = opt.indexOf(' = ');
    if (eqIdx >= 0) {
        const value = opt.slice(eqIdx + 3);
        // ON / OFF are keywords; any other value is kept as written
        return [keyword(opt.slice(0, eqIdx), opts), ' = ', /^(ON|OFF)$/i.test(value) ? keyword(value, opts) : value];
    }
    // MOVE N'logical' TO N'physical' — keyword MOVE and TO, literals verbatim
    const moveMatch = opt.match(MOVE_OPT_RE);
    if (moveMatch) {
        return [keyword(moveMatch[1]!, opts), ' ', moveMatch[2]!, ' ', keyword(moveMatch[3]!, opts), ' ', moveMatch[4]!];
    }
    // Guard: if the string starts with a literal, don't try to keyword-case it
    if (opt.startsWith("N'") || opt.startsWith("'")) return opt;
    return keyword(opt, opts);
}

/** DISK = '...' | TAPE = ... | URL = ...: the kind is a keyword. A logical device name has no kind and keeps its case. */
function deviceDoc(device: string, opts: Options): Doc {
    return device.includes(' = ') ? kwOpt(device, opts) : device;
}

// ---------------------------------------------------------------------------
// BACKUP DATABASE / LOG
// ---------------------------------------------------------------------------

function printBackupBase(verb: Doc, node: SqlNode, opts: Options): Doc {
    const database = propStr(node, 'database') ?? '';
    const devices = node.props?.['devices'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const mirrorTo = node.props?.['mirrorTo'] as string[][] | undefined;
    const files = node.props?.['files'] as string[] | undefined;

    // FILE = f, FILEGROUP = g, ...: between the database and TO
    const filesPart: Doc = files?.length ? [hardline, join(', ', files.map((f) => kwOpt(f, opts)))] : '';

    const toPart: Doc = devices?.length
        ? [
              hardline,
              keyword('TO', opts),
              ' ',
              join(
                  [',', hardline],
                  devices.map((d) => deviceDoc(d, opts)),
              ),
          ]
        : '';

    const mirrorParts: Doc[] =
        mirrorTo?.map((m) => [hardline, keyword('MIRROR TO', opts), ' ', join([',', hardline], m.map((d) => deviceDoc(d, opts)))] as Doc) ?? [];

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

    return group([verb, ' ', database, indent([filesPart, toPart, ...mirrorParts, withPart]), ';']);
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
    const files = node.props?.['files'] as string[] | undefined;
    const filesPart: Doc = files?.length ? [hardline, join(', ', files.map((f) => kwOpt(f, opts)))] : '';

    const fromPart: Doc = devices?.length
        ? [
              hardline,
              keyword('FROM', opts),
              ' ',
              join(
                  [',', hardline],
                  devices.map((d) => deviceDoc(d, opts)),
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

    return group([keyword('RESTORE', opts), ' ', keyword(kind, opts), dbPart, indent([filesPart, fromPart, withPart]), ';']);
}

// ---------------------------------------------------------------------------
// CREATE DATABASE
// ---------------------------------------------------------------------------

/** One file spec, `(NAME = a, FILENAME = 'x', SIZE = 10MB)`: inline when it fits, one option per line when not. */
function fileSpecDoc(spec: string, opts: Options): Doc {
    const m = /^\((.*)\)$/s.exec(spec);
    if (!m) return spec;
    const options = splitTopLevel(m[1]!).map((o) => kwOpt(o, opts));
    return group(['(', indent([softline, join([',', line], options)]), softline, ')']);
}

/**
 * The items of a CREATE DATABASE ON list. A named filegroup (`FILEGROUP fg [DEFAULT] (spec), (spec)`) is one
 * item with its specs on indented lines; `PRIMARY (spec)` and a bare `(spec)` are items of their own.
 */
function fileGroupItems(text: string, opts: Options): Doc[] {
    const open = text.indexOf('(');
    if (open < 0) return [text];
    const head = text.slice(0, open).trim();
    const specs = splitTopLevel(text.slice(open));
    // FILEGROUP name [CONTAINS FILESTREAM] [DEFAULT]: the name is one token, even [with spaces]
    const named = /^(FILEGROUP)\s+(\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"|\S+)(.*)$/is.exec(head);
    if (named) {
        const [, kw, name, rest] = named;
        const headDoc: Doc = [keyword(kw!, opts), ' ', name!, ...rest!.trim().split(/\s+/).filter(Boolean).map((w): Doc => [' ', keyword(w, opts)])];
        return [[headDoc, indent([hardline, join([',', hardline], specs.map((s) => fileSpecDoc(s, opts)))])]];
    }
    return specs.map((s, i): Doc => [i === 0 && head ? [keyword(head, opts), ' '] : '', fileSpecDoc(s, opts)]);
}

export function printCreateDatabase(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const containment = propStr(node, 'containment');
    const collation = propStr(node, 'collation');
    const snapshot = propStr(node, 'snapshot');
    const copyOf = propStr(node, 'copyOf');
    const attach = propStr(node, 'attach');
    const fileGroups = node.props?.['fileGroups'] as string[] | undefined;
    const logOn = node.props?.['logOn'] as string[] | undefined;
    const options = node.props?.['options'] as string[] | undefined;
    const optionsParen = node.props?.['optionsParen'] === true;

    // CREATE DATABASE name [CONTAINMENT = x] [ON files [LOG ON files]] [COLLATE c]
    //   [FOR ATTACH | AS SNAPSHOT OF s | AS COPY OF d] [WITH options]
    const parts: Doc[] = [keyword('CREATE DATABASE', opts), ' ', name];

    if (containment) parts.push(' ', keyword('CONTAINMENT', opts), ' = ', keyword(containment, opts));
    if (fileGroups?.length) {
        parts.push(hardline, keyword('ON', opts));
        parts.push(indent([hardline, join([',', hardline], fileGroups.flatMap((g) => fileGroupItems(g, opts)))]));
    }
    if (logOn?.length) {
        parts.push(hardline, keyword('LOG ON', opts));
        parts.push(indent([hardline, join([',', hardline], logOn.flatMap((g) => fileGroupItems(g, opts)))]));
    }
    if (collation) parts.push(hardline, keyword('COLLATE', opts), ' ', collation);
    if (attach) parts.push(hardline, keyword(`FOR ${attach}`, opts));
    // AS SNAPSHOT OF / AS COPY OF stay on the name's line unless files precede them
    const asSep: Doc = fileGroups?.length ? hardline : ' ';
    if (snapshot) parts.push(asSep, keyword('AS SNAPSHOT OF', opts), ' ', snapshot);
    if (copyOf) parts.push(asSep, keyword('AS COPY OF', opts), ' ', copyOf);
    if (options?.length) {
        // WITH opt, opt (or, for Azure, (opt, opt)): on the line below when it fits, otherwise one option per line
        const optionDocs = options.map((o) => kwOpt(o, opts));
        parts.push(
            optionsParen
                ? [' ', group(['(', indent([softline, join([',', line], optionDocs)]), softline, ')'])]
                : [hardline, group([keyword('WITH', opts), indent([line, join([',', line], optionDocs)])])],
        );
    }

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

    // ALTER DATABASE d MODIFY (EDITION = ..., SERVICE_OBJECTIVE = ...) [WITH MANUAL_CUTOVER] (Azure SQL)
    if (propBool(node, 'modify')) {
        const cutover: Doc = propBool(node, 'manualCutover') ? [' ', keyword('WITH MANUAL_CUTOVER', opts)] : '';
        return [alterDbHeader(node, opts), hardline, keyword('MODIFY', opts), ' ', optionItems((options ?? []).map((o) => keyword(o, opts)), opts), cutover, ';'];
    }

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
        ? join(
              [',', line],
              files.map((f) => caseFileSpec(f, opts)),
          )
        : '';

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
    return group([alterDbHeader(node, opts), hardline, keyword('MODIFY FILE', opts), ' ', file, ';']);
}

export function printAlterDatabaseModifyFileGroup(node: SqlNode, opts: Options): Doc {
    const fileGroup = propStr(node, 'fileGroup') ?? '';
    const makeDefault = propBool(node, 'makeDefault');
    const option = propStr(node, 'option');

    const newName = propStr(node, 'newName');
    const termination = propStr(node, 'termination');

    const action: Doc = makeDefault
        ? keyword('DEFAULT', opts)
        : newName
          ? [keyword('NAME', opts), ' = ', newName]
          : keyword(option ?? '', opts);
    const termPart: Doc = termination ? [' ', keyword(termination, opts)] : '';
    return [alterDbHeader(node, opts), ' ', keyword('MODIFY FILEGROUP', opts), ' ', fileGroup, ' ', action, termPart, ';'];
}

// ---------------------------------------------------------------------------
// ALTER DATABASE REBUILD LOG
// ---------------------------------------------------------------------------

export function printAlterDatabaseRebuildLog(node: SqlNode, opts: Options): Doc {
    const file = propStr(node, 'file');
    const onPart: Doc = file ? [' ', keyword('ON', opts), ' ', caseFileSpec(file, opts)] : '';
    return [alterDbHeader(node, opts), ' ', keyword('REBUILD LOG', opts), onPart, ';'];
}

// ---------------------------------------------------------------------------
// ALTER EVENT SESSION
// ---------------------------------------------------------------------------

export function printAlterEventSession(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const scope = propStr(node, 'scope') ?? 'SERVER';
    const state = propStr(node, 'state');
    return [
        keyword('ALTER EVENT SESSION', opts),
        ' ',
        name,
        ' ',
        keyword('ON', opts),
        ' ',
        keyword(scope, opts),
        ' ',
        keyword('STATE', opts),
        ' = ',
        keyword(state ?? 'START', opts),
        ';',
    ];
}
