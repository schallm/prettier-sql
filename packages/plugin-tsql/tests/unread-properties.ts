/**
 * The ScriptDom properties the AST builder doesn't read (see PropertyCoverage.cs), each
 * with the reason. property-coverage.test.ts requires this list to match exactly.
 */

/** Safe to leave unread: the property means nothing the output doesn't already say. */
export const unused: Record<string, string> = {
    'ChildObjectName.Count': 'the number of Identifiers, which the builder reads',
    'MultiPartIdentifier.Count': 'the number of Identifiers, which the builder reads',
    'SchemaObjectName.Count': 'the number of Identifiers, which the builder reads',
    'Identifier.QuoteType': '[a], "a" and a are the same identifier; the printer brackets a name where it needs to',
    'StringLiteral.LiteralType': 'always String for a StringLiteral',
    'StringLiteral.IsLargeObject': 'whether the value exceeds 8000 bytes, which follows from the value',
    'AlterIndexStatement.All': 'ALTER INDEX ALL has no index name, and a missing name prints as ALL',
    'AlterTableConstraintModificationStatement.All': 'CHECK/NOCHECK CONSTRAINT ALL has no constraint names, and an empty list prints as ALL',
    'DbccStatement.DllName': 'the command name is read from the token stream (DbccCommandName)',
    'DbccStatement.ParenthesisRequired': 'DBCC CHECKDB() and DBCC CHECKDB run the same command',
    'LikePredicate.OdbcEscape': "LIKE 'x%' {ESCAPE '\\'} and LIKE 'x%' ESCAPE '\\' match the same rows",
    'DeclareTableVariableBody.AsDefined': 'DECLARE @t AS TABLE and DECLARE @t TABLE declare the same variable',
    'CreateIndexStatement.Translated80SyntaxTo90':
        'records that SQL Server 2000 option syntax was read; the options themselves are built',
    'OdbcFunctionCall.ParametersUsed': 'TSql180Parser requires the parentheses ({fn now} does not parse), so it is always true',
    'CreateExternalModelStatement.ModelTypeSpecification': 'the same option as ModelType, which the builder reads',
    'ColumnEncryptionAlgorithmNameParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnEncryptionAlgorithmParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnEncryptionKeyNameParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnEncryptionTypeParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnMasterKeyEnclaveComputationsParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnMasterKeyNameParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnMasterKeyPathParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'ColumnMasterKeyStoreProviderNameParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    'EncryptedValueParameter.ParameterKind': "fixed by the parameter's class, which the builder switches on",
    // Kept through source text rather than a property read
    'SchemaDeclarationItemOpenjson.ColumnDefinition': 'OPENJSON WITH columns are kept as source text (BuildSchemaItem)',
    'SchemaDeclarationItemOpenjson.Mapping': 'OPENJSON WITH columns are kept as source text (BuildSchemaItem)',
    'TriggerAction.EventTypeGroup': 'a DDL event group is printed from its source text (TriggerActionToSql)',
    'FileStreamDatabaseOption.NonTransactedAccess': 'database options are printed from their source text (DatabaseOptionText)',
    'CryptoMechanism.PasswordOrSignature': 'kept in the source text of the crypto mechanism',
    'AlterEventSessionStatement.DropEventDeclarations': 'ALTER EVENT SESSION ADD/DROP is kept as source text',
    'AlterEventSessionStatement.DropTargetDeclarations': 'ALTER EVENT SESSION ADD/DROP is kept as source text',
    'AlterEventSessionStatement.EventDeclarations': 'ALTER EVENT SESSION ADD/DROP is kept as source text',
    'AlterEventSessionStatement.SessionOptions': 'ALTER EVENT SESSION ADD/DROP is kept as source text',
    'AlterEventSessionStatement.TargetDeclarations': 'ALTER EVENT SESSION ADD/DROP is kept as source text',
    'EventSessionStatement.EventDeclarations': 'CREATE EVENT SESSION is kept as source text',
    'EventSessionStatement.SessionOptions': 'CREATE EVENT SESSION is kept as source text',
    'EventSessionStatement.TargetDeclarations': 'CREATE EVENT SESSION is kept as source text',
};

/** TSql180Parser never sets these: it rejects the syntax that would. */
export const unreachable: Record<string, string> = {
    'CommonTableExpression.WithCtesAndXmlNamespaces': 'a nested WITH inside a CTE does not parse',
    'CreateTableStatement.ClonePointInTime': 'CREATE TABLE ... AS CLONE OF is Fabric-only and does not parse',
    'CreateTableStatement.CloneSource': 'CREATE TABLE ... AS CLONE OF is Fabric-only and does not parse',
    'SelectStatement.ComputeClauses': 'COMPUTE was removed in SQL Server 2012 and does not parse',
    'FromClause.PredictTableReference': 'FROM PREDICT(...) parses as a table reference instead; no syntax found that sets it',
};

/**
 * Known bugs: formatting drops these and changes the query's meaning. Fix the builder
 * and printer, add a fixture, and take the entry out.
 */
export const dropped: Record<string, string> = {
    'AlterDatabaseSetStatement.WithManualCutover': 'WITH MANUAL_CUTOVER is dropped',
    'ExpressionGroupingSpecification.DistributedAggregation': 'GROUP BY a WITH (DISTRIBUTED_AGG) loses the hint',
    'InsertSpecification.InsertOption': 'INSERT OVER t prints as INSERT INTO t (INSERT t and INSERT INTO t are equivalent)',
};
