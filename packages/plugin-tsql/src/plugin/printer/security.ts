import type { Doc } from 'prettier';
import type { SqlNode } from '../parser/types.js';
import type { Options } from './utils.js';
import { keyword, hardline, join, indent, group, line, softline, ifExistsDoc } from './utils.js';
import { propStr, propBool } from './helpers.js';

// ---------------------------------------------------------------------------
// GRANT / DENY / REVOKE
// ---------------------------------------------------------------------------

const securityObjectKindMap: Record<string, string> = {
    NotSpecified: '',
    Object: 'OBJECT',
    Database: 'DATABASE',
    Schema: 'SCHEMA',
    Login: 'LOGIN',
    User: 'USER',
    Role: 'ROLE',
    ServerRole: 'SERVER ROLE',
    Server: 'SERVER',
    Assembly: 'ASSEMBLY',
    AsymmetricKey: 'ASYMMETRIC KEY',
    Certificate: 'CERTIFICATE',
    Contract: 'CONTRACT',
    Endpoint: 'ENDPOINT',
    FullTextCatalog: 'FULLTEXT CATALOG',
    FullTextStopList: 'FULLTEXT STOPLIST',
    MessageType: 'MESSAGE TYPE',
    RemoteServiceBinding: 'REMOTE SERVICE BINDING',
    Route: 'ROUTE',
    SearchPropertyList: 'SEARCH PROPERTY LIST',
    Service: 'SERVICE',
    SymmetricKey: 'SYMMETRIC KEY',
    Type: 'TYPE',
    XmlSchemaCollection: 'XML SCHEMA COLLECTION',
    AvailabilityGroup: 'AVAILABILITY GROUP',
};

function printSecurityTarget(target: Record<string, unknown>, opts: Options): Doc {
    const kind = (target['objectKind'] as string) ?? 'NotSpecified';
    const objName = target['objectName'] as string | undefined;
    const cols = target['columns'] as string[] | undefined;

    if (kind === 'Server') return keyword('SERVER', opts);

    const className = securityObjectKindMap[kind] ?? kind.toUpperCase();
    const prefix: Doc = className ? [keyword(className, opts), '::'] : '';
    let result: Doc = [prefix, objName ?? ''];
    if (cols && cols.length > 0) result = [result, ' (', join(', ', cols), ')'];
    return result;
}

function printSecurityPrincipal(p: Record<string, unknown>, opts: Options): Doc {
    const type = (p['principalType'] as string) ?? '';
    if (type === 'Public') return keyword('PUBLIC', opts);
    return (p['name'] as string) ?? '';
}

function printPermission(p: Record<string, unknown>, opts: Options): Doc {
    const name = ((p['name'] as string) ?? '').toUpperCase();
    const cols = p['columns'] as string[] | undefined;
    const parts: Doc[] = [keyword(name, opts)];
    if (cols && cols.length > 0) parts.push(' (', join(', ', cols), ')');
    return parts;
}

export function printGrantDenyRevoke(node: SqlNode, verb: string, opts: Options): Doc {
    const perms = (node.props?.['permissions'] as Record<string, unknown>[]) ?? [];
    const target = node.props?.['target'] as Record<string, unknown> | undefined;
    const principals = (node.props?.['principals'] as Record<string, unknown>[]) ?? [];
    const asClause = node.props?.['asClause'] as string | undefined;
    const withGrant = node.props?.['withGrantOption'] as boolean | undefined;
    const cascade = node.props?.['cascade'] as boolean | undefined;
    const grantOptFor = node.props?.['grantOptionFor'] as boolean | undefined;

    const permDocs = perms.map((p) => printPermission(p, opts));
    const principalDocs = principals.map((p) => printSecurityPrincipal(p, opts));

    // Verb + optional "GRANT OPTION FOR" prefix (REVOKE only)
    const verbParts: Doc[] = [keyword(verb, opts)];
    if (grantOptFor) verbParts.push(' ', keyword('GRANT OPTION FOR', opts));

    // Permissions: wrap only when they exceed printWidth
    const permPart: Doc = [' ', group([indent([softline, join([',', line], permDocs)])])];

    const parts: Doc[] = [...verbParts, permPart];

    if (target) parts.push([hardline, keyword('ON', opts), ' ', printSecurityTarget(target, opts)]);

    const direction = verb === 'REVOKE' ? 'FROM' : 'TO';
    parts.push([hardline, keyword(direction, opts), ' ', join(', ', principalDocs)]);

    if (withGrant) parts.push([hardline, keyword('WITH GRANT OPTION', opts)]);
    if (cascade) parts.push([hardline, keyword('CASCADE', opts)]);
    if (asClause) parts.push([hardline, keyword('AS', opts), ' ', asClause]);

    parts.push(';');
    return parts;
}

// ---------------------------------------------------------------------------
// USER / LOGIN / ROLE — shared option helpers
// ---------------------------------------------------------------------------

/** Map PrincipalOptionKind → SQL keyword (uppercase; keyword() applies casing). */
const principalOptionKindMap: Record<string, string> = {
    DefaultDatabase: 'DEFAULT_DATABASE',
    DefaultLanguage: 'DEFAULT_LANGUAGE',
    DefaultSchema: 'DEFAULT_SCHEMA',
    Sid: 'SID',
    AllowEncryptedValueModifications: 'ALLOW_ENCRYPTED_VALUE_MODIFICATIONS',
    CheckExpiration: 'CHECK_EXPIRATION',
    CheckPolicy: 'CHECK_POLICY',
    Name: 'NAME',
    Password: 'PASSWORD',
    DefaultDomain: 'DEFAULT_DOMAIN',
    MustChange: 'MUST_CHANGE',
    Credential: 'CREDENTIAL',
    OldPassword: 'OLD_PASSWORD',
    Unlock: 'UNLOCK',
};

function principalOptionKw(kind: string, opts: Options): Doc {
    const sql = principalOptionKindMap[kind] ?? kind.toUpperCase();
    return keyword(sql, opts);
}

function printPrincipalOption(o: Record<string, unknown>, opts: Options): Doc {
    const kind = (o['kind'] as string) ?? '';
    if (kind === 'Password') {
        const pw = o['password'] as string | undefined;
        const old = o['oldPassword'] as string | undefined;
        const hashed = o['hashed'] as boolean | undefined;
        const mustChange = o['mustChange'] as boolean | undefined;
        const unlock = o['unlock'] as boolean | undefined;
        const parts: Doc[] = [keyword('PASSWORD', opts), ' = ', pw ?? ''];
        if (hashed) parts.push(' ', keyword('HASHED', opts));
        if (mustChange) parts.push(' ', keyword('MUST_CHANGE', opts));
        if (old) parts.push([',', hardline, keyword('OLD_PASSWORD', opts), ' = ', old]);
        if (unlock) parts.push([',', hardline, keyword('UNLOCK', opts)]);
        return parts;
    }
    if ('onOff' in o) {
        return [principalOptionKw(kind, opts), ' = ', keyword((o['onOff'] as string).toUpperCase(), opts)];
    }
    if ('value' in o) {
        return [principalOptionKw(kind, opts), ' = ', (o['value'] as string) ?? ''];
    }
    if ('identifier' in o) {
        return [principalOptionKw(kind, opts), ' = ', (o['identifier'] as string) ?? ''];
    }
    return principalOptionKw(kind, opts);
}

function withOptionsPart(items: Doc[]): Doc {
    return items.length === 1 ? [' ', items[0]!] : indent([hardline, join([',', hardline], items)]);
}

/** Expands a password option into multiple peer items so OLD_PASSWORD and UNLOCK
 *  are treated as separate WITH options rather than embedded sub-lines. */
function expandPasswordOption(o: Record<string, unknown>, opts: Options): Doc[] {
    const pw = o['password'] as string | undefined;
    const old = o['oldPassword'] as string | undefined;
    const hashed = o['hashed'] as boolean | undefined;
    const mustChange = o['mustChange'] as boolean | undefined;
    const unlock = o['unlock'] as boolean | undefined;
    const pwDoc: Doc[] = [keyword('PASSWORD', opts), ' = ', pw ?? ''];
    if (hashed) pwDoc.push(' ', keyword('HASHED', opts));
    if (mustChange) pwDoc.push(' ', keyword('MUST_CHANGE', opts));
    const result: Doc[] = [pwDoc];
    if (old) result.push([keyword('OLD_PASSWORD', opts), ' = ', old]);
    if (unlock) result.push(keyword('UNLOCK', opts));
    return result;
}

function printPrincipalOptions(node: SqlNode, opts: Options): Doc {
    const options = node.props?.['options'];
    if (!Array.isArray(options) || options.length === 0) return '';
    const parts = (options as Record<string, unknown>[]).map((o) => printPrincipalOption(o, opts));
    return [keyword('WITH', opts), withOptionsPart(parts)];
}

// ---------------------------------------------------------------------------
// USER
// ---------------------------------------------------------------------------

export function printCreateUser(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const loginType = propStr(node, 'loginOptionType') ?? '';
    const loginId = propStr(node, 'loginOptionId');
    const optionsDoc = printPrincipalOptions(node, opts);

    const loginTypeMap: Record<string, string> = {
        Login: 'FOR LOGIN',
        Certificate: 'FOR CERTIFICATE',
        AsymmetricKey: 'FOR ASYMMETRIC KEY',
        WithoutLogin: 'WITHOUT LOGIN',
        External: 'FROM EXTERNAL PROVIDER',
    };
    const loginClause = loginTypeMap[loginType];

    const parts: Doc[] = [keyword('CREATE USER', opts), ' ', name];
    if (loginClause) {
        parts.push([hardline, keyword(loginClause, opts)]);
        if (loginId) parts.push(' ', loginId);
    }
    if (optionsDoc !== '') parts.push([hardline, optionsDoc]);
    parts.push(';');
    return parts;
}

export function printAlterUser(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    return [keyword('ALTER USER', opts), ' ', name, hardline, printPrincipalOptions(node, opts), ';'];
}

export function printDropUser(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP USER', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------

export function printCreateLogin(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const sourceType = propStr(node, 'sourceType') ?? '';
    const parts: Doc[] = [keyword('CREATE LOGIN', opts), ' ', name];

    if (sourceType === 'Password') {
        const pw = propStr(node, 'password') ?? '';
        const hashed = node.props?.['hashed'] as boolean | undefined;
        const mustChange = node.props?.['mustChange'] as boolean | undefined;
        const pwParts: Doc[] = [keyword('PASSWORD', opts), ' = ', pw];
        if (hashed) pwParts.push(' ', keyword('HASHED', opts));
        if (mustChange) pwParts.push(' ', keyword('MUST_CHANGE', opts));
        const options = node.props?.['options'];
        const optDocs: Doc[] = Array.isArray(options)
            ? (options as Record<string, unknown>[]).map((o) => printPrincipalOption(o, opts))
            : [];
        const allOpts: Doc[] = [pwParts, ...optDocs];
        parts.push([hardline, keyword('WITH', opts), withOptionsPart(allOpts)]);
    } else if (sourceType === 'Windows') {
        parts.push([hardline, keyword('FROM WINDOWS', opts)]);
        const optionsDoc = printPrincipalOptions(node, opts);
        if (optionsDoc !== '') parts.push([hardline, optionsDoc]);
    } else if (sourceType === 'Certificate') {
        parts.push([hardline, keyword('FROM CERTIFICATE', opts), ' ', propStr(node, 'sourceName') ?? '']);
    } else if (sourceType === 'AsymmetricKey') {
        parts.push([hardline, keyword('FROM ASYMMETRIC KEY', opts), ' ', propStr(node, 'sourceName') ?? '']);
    } else if (sourceType) {
        parts.push([' ', sourceType]);
    }
    parts.push(';');
    return parts;
}

export function printAlterLogin(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const action = propStr(node, 'action') ?? '';
    const base: Doc = [keyword('ALTER LOGIN', opts), ' ', name];

    if (action === 'Enable') return [base, ' ', keyword('ENABLE', opts), ';'];
    if (action === 'Disable') return [base, ' ', keyword('DISABLE', opts), ';'];
    if (action === 'AddCredential') {
        return [base, hardline, keyword('ADD CREDENTIAL', opts), ' ', propStr(node, 'credentialName') ?? '', ';'];
    }
    if (action === 'DropCredential') {
        return [base, hardline, keyword('DROP CREDENTIAL', opts), ' ', propStr(node, 'credentialName') ?? '', ';'];
    }
    if (action === 'WithOptions') {
        const options = node.props?.['options'];
        const optDocs: Doc[] = Array.isArray(options)
            ? (options as Record<string, unknown>[]).flatMap((o) =>
                  (o['kind'] as string) === 'Password'
                      ? expandPasswordOption(o, opts)
                      : [printPrincipalOption(o, opts)],
              )
            : [];
        return [base, hardline, keyword('WITH', opts), withOptionsPart(optDocs), ';'];
    }
    return [base, ';'];
}

export function printDropLogin(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP LOGIN', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
}

// ---------------------------------------------------------------------------
// ROLE
// ---------------------------------------------------------------------------

export function printCreateRole(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const owner = propStr(node, 'owner');
    return [
        keyword('CREATE ROLE', opts),
        ' ',
        name,
        owner ? [hardline, keyword('AUTHORIZATION', opts), ' ', owner] : '',
        ';',
    ];
}

export function printAlterRole(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const action = propStr(node, 'action') ?? '';
    const base: Doc = [keyword('ALTER ROLE', opts), ' ', name];

    if (action === 'AddMember')
        return [base, hardline, keyword('ADD MEMBER', opts), ' ', propStr(node, 'member') ?? '', ';'];
    if (action === 'DropMember')
        return [base, hardline, keyword('DROP MEMBER', opts), ' ', propStr(node, 'member') ?? '', ';'];
    if (action === 'Rename')
        return [base, hardline, keyword('WITH NAME', opts), ' = ', propStr(node, 'newName') ?? '', ';'];
    return [base, ';'];
}

export function printDropRole(node: SqlNode, opts: Options): Doc {
    const name = propStr(node, 'name') ?? '';
    const ifExists = propBool(node, 'ifExists');
    return [keyword('DROP ROLE', opts), ifExistsDoc(ifExists, opts), ' ', name, ';'];
}
