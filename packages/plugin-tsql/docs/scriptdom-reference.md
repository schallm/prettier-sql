# ScriptDom API Reference & Quirks

Practical notes on the `Microsoft.SqlServer.TransactSql.ScriptDom` API as used in this project.
Covers property names, enum types, type-discrimination patterns, and non-obvious behaviours
discovered while building `AstBuilder.cs`.

---

## Parser

```csharp
var parser = new TSql170Parser(initialQuotedIdentifiers: false);
var fragment = parser.Parse(new StringReader(sql), out var errors);
```

- Use `TSql170Parser` (SQL Server 2022+) for the widest syntax support.
- `initialQuotedIdentifiers: false` matches SQL Server's default `QUOTED_IDENTIFIER OFF` boot
  state; setting it `true` would reject some valid identifiers.
- Parse errors come back as `IList<ParseError>` — each has `.Message`, `.Line`, `.Column`,
  `.Offset`.

---

## Fragment offsets

Every `TSqlFragment` exposes:

| Property            | Meaning                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `StartOffset`       | byte offset of first character in the original SQL string                |
| `FragmentLength`    | byte length of this fragment                                             |
| `ScriptTokenStream` | the **full** token stream for the entire script (not just this fragment) |

To reconstruct raw text for a fragment, iterate the token stream and include tokens whose
`Offset` falls within `[StartOffset, StartOffset + FragmentLength)`.

---

## Type-discrimination pattern

ScriptDom uses deep inheritance hierarchies. The `AstBuilder` uses the runtime type name as a
discriminator string (stored as `alterType`, `alterIndexType`, etc.) so the TypeScript side can
branch without knowing the C# type hierarchy:

```csharp
var alterType = at.GetType().Name;  // e.g. "AlterTableAddTableElementStatement"
props["alterType"] = alterType;
```

---

## Enum types and values

### `ConstraintEnforcement`

Used in **two different places**:

| Property                                                          | Type                    |
| ----------------------------------------------------------------- | ----------------------- |
| `AlterTableAddTableElementStatement.ExistingRowsCheckEnforcement` | `ConstraintEnforcement` |
| `AlterTableConstraintModificationStatement.ConstraintEnforcement` | `ConstraintEnforcement` |

Values: `NotSpecified = 0`, `NoCheck = 1`, `Check = 2`

> **Quirk:** The _property_ on `AlterTableAddTableElementStatement` is named
> `ExistingRowsCheckEnforcement` but its _type_ is `ConstraintEnforcement`, not a separate
> `ExistingRowsCheckEnforcement` enum. Using the type name in a comparison will cause a
> compile error; use `ConstraintEnforcement.NotSpecified` etc.

### `DeleteUpdateAction`

Used by `ForeignKeyConstraintDefinition.DeleteAction` and `.UpdateAction`.

Values: `NotSpecified`, `Cascade`, `NoAction`, `SetNull`, `SetDefault`

`NotSpecified` means no `ON DELETE` / `ON UPDATE` clause was written — omit it from output.

### `TableElementType`

Used by `AlterTableDropTableElement.TableElementType`.

Values: `Column`, `Constraint`

Determines whether the DROP renders as `DROP COLUMN` or `DROP CONSTRAINT`.

### `QualifiedJoinType`

Values: `Inner`, `LeftOuter`, `RightOuter`, `FullOuter`

### `UnqualifiedJoinType`

Values: `CrossJoin`, `CrossApply`, `OuterApply`

### `BooleanComparisonType`

Values (as strings): `Equals`, `NotEqualToBrackets`, `NotEqualToExclamation`, `LessThan`,
`GreaterThan`, `LessThanOrEqualTo`, `GreaterThanOrEqualTo`, `LeftOuterJoin`, `RightOuterJoin`,
`NotLessThan`, `NotGreaterThan`

### `BooleanTernaryExpressionType`

`Between` and `NotBetween` — the only concrete subtype is `BooleanTernaryExpression` (used for
`BETWEEN`).

### `UniqueRowFilter`

Values: `NotSpecified`, `Distinct`, `All`
Used on `QuerySpecification.UniqueRowFilter` and `FunctionCall.UniqueRowFilter`.

### `SortOrder`

Values: `NotSpecified`, `Ascending`, `Descending`

---

## ALTER TABLE subtypes

`AlterTableStatement` is abstract. Discriminate via `.GetType().Name`:

| `alterType` string                          | SQL construct                 |
| ------------------------------------------- | ----------------------------- |
| `AlterTableAddTableElementStatement`        | `ADD column / constraint`     |
| `AlterTableDropTableElementStatement`       | `DROP COLUMN / CONSTRAINT`    |
| `AlterTableConstraintModificationStatement` | `CHECK / NOCHECK CONSTRAINT`  |
| `AlterTableAlterColumnStatement`            | `ALTER COLUMN`                |
| `AlterTableSetStatement`                    | `SET (LOCK_ESCALATION = ...)` |
| `AlterTableSwitchStatement`                 | `SWITCH [PARTITION n] TO ...` |
| `AlterTableRebuildStatement`                | `REBUILD [PARTITION = ...]`   |

### `AlterTableDropTableElement`

```csharp
e.Name?.Value        // identifier string
e.TableElementType   // TableElementType.Column | TableElementType.Constraint
e.IsIfExists         // bool — SQL Server 2016+
```

Multiple elements in one DROP statement all share the same `IsIfExists` flag.

### `AlterTableConstraintModificationStatement`

```csharp
cm.ConstraintEnforcement   // ConstraintEnforcement.Check | .NoCheck
cm.ConstraintNames         // IList<Identifier> — empty means ALL
```

---

## `AlterIndexStatement` subtypes

Discriminated the same way via `alterIndexType`:

| `alterIndexType` string                      | SQL construct  |
| -------------------------------------------- | -------------- |
| `AlterIndexStatement` (base type name)       | fallback       |
| `Rebuild` / `Reorganize` / `Disable` / `Set` | operation kind |

The `AlterIndexStatement.AlterIndexType` property (enum) is used instead of the class name.

---

## `ForeignKeyConstraintDefinition`

```csharp
fk.Columns                    // IList<Identifier> — local columns
fk.ReferenceTableName         // SchemaObjectName
fk.ReferencedTableColumns     // IList<Identifier> — referenced columns
fk.DeleteAction               // DeleteUpdateAction (NotSpecified = omit clause)
fk.UpdateAction               // DeleteUpdateAction (NotSpecified = omit clause)
```

---

## `NullableConstraintDefinition` — nullable tristate

Column nullability is expressed as an **optional constraint**, not a boolean property. Access via:

```csharp
col.Constraints?.OfType<NullableConstraintDefinition>()
    .FirstOrDefault()?.Nullable   // bool? — true = NULL, false = NOT NULL, null = not specified
```

This tristate is preserved in the AST as `nullable: true | false | undefined` so the printer can
omit the clause when the author didn't write it.

---

## `TOP` expression — unwrap parens

`TOP (n)` stores `n` as a `ParenthesisExpression` wrapping the real expression. Unwrap it to
avoid double parens in the output:

```csharp
var expr = top.Expression is ParenthesisExpression pe ? pe.Expression : top.Expression;
```

---

## `ColumnReferenceExpression` — wildcard detection

`COUNT(*)` produces a `ColumnReferenceExpression` with `ColumnType.Wildcard` and **no
identifiers** in `MultiPartIdentifier`. Check `ColumnType` before accessing identifiers.

---

## `CaseExpression` subtypes

`CaseExpression` has two concrete subtypes:

- `SimpleCaseExpression` — `CASE input WHEN val THEN result ...`
    - `.InputExpression` is a `ScalarExpression`
    - `.WhenClauses` each have `.WhenExpression` (scalar) and `.ThenExpression` (scalar)
- `SearchedCaseExpression` — `CASE WHEN condition THEN result ...`
    - `.WhenClauses` each have `.WhenExpression` (**boolean**) and `.ThenExpression` (scalar)

---

## `FunctionCall` — SQL Server 2022+ extensions

Several `FunctionCall` properties only populate on SQL Server 2022 functions:

| Property             | Populated by                                  |
| -------------------- | --------------------------------------------- |
| `IgnoreRespectNulls` | `FIRST_VALUE(...) IGNORE NULLS OVER (...)`    |
| `TrimOptions`        | `TRIM(LEADING \| TRAILING \| BOTH ...)`       |
| `JsonParameters`     | `JSON_OBJECT(key: value ...)`                 |
| `AbsentOrNullOnNull` | `JSON_OBJECT(...) NULL ON NULL`               |
| `JsonOrderByClause`  | `JSON_ARRAYAGG(... ORDER BY ...)`             |
| `WithinGroupClause`  | `STRING_AGG(...) WITHIN GROUP (ORDER BY ...)` |

---

## Comments

Comments are **not** part of the AST fragment tree. Extract them from the token stream after
parsing:

```csharp
var comments = fragment.ScriptTokenStream
    .Where(t => t.TokenType == TSqlTokenType.SingleLineComment
             || t.TokenType == TSqlTokenType.MultilineComment)
    ...
```

`TSqlTokenType.SingleLineComment` = `--...`
`TSqlTokenType.MultilineComment` = `/* ... */`

Single-line comment text includes the leading `--`; strip 2 chars and trim the right end.
Block comment text includes `/*` and `*/`; strip 2 chars from each end.

---

## `SchemaObjectName` structure

```
[server].[database].[schema].[name]
```

| Property             | Accessor                      |
| -------------------- | ----------------------------- |
| `BaseIdentifier`     | the rightmost (object) name   |
| `SchemaIdentifier`   | schema (second from right)    |
| `DatabaseIdentifier` | database                      |
| `ServerIdentifier`   | server (four-part names only) |

All are `Identifier?` — null when that part was not written.

---

## `MultiPartIdentifier` — last-part pattern

Index columns and some other references use `MultiPartIdentifier.Identifiers` (a list). The
object name is always the **last** identifier:

```csharp
col.MultiPartIdentifier?.Identifiers.LastOrDefault()?.Value
```

---

## `ParameterlessCall` keywords

`ParameterlessCallType` enum → SQL keyword mapping (non-obvious values):

| Enum value         | SQL                 |
| ------------------ | ------------------- |
| `CurrentTimestamp` | `CURRENT_TIMESTAMP` |
| `CurrentUser`      | `CURRENT_USER`      |
| `SessionUser`      | `SESSION_USER`      |
| `SystemUser`       | `SYSTEM_USER`       |
| `CurrentDate`      | `CURRENT_DATE`      |
| _(anything else)_  | `USER`              |
