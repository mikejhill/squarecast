# Portable Document Kit Integration

Squarecast consumes the Portable Document Kit through compatibility adapters.
The integration adopts generic document concepts without changing Squarecast's
stored data, URLs, or Firebase security model.

## Installed Packages

| Package                                | Squarecast use                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `@mikejhill/portable-document-core`    | Validates and applies `EditorOperation` commands through `SquarecastDocument` |
| `@mikejhill/portable-document-codec`   | Provides the injectable LZString compression port used by `StateCodec`        |
| `@mikejhill/portable-document-browser` | Parses pointer routes and manages pending History API policy                  |

Dependencies are pinned to exact versions. Portable protocol or behavior
changes must be reviewed explicitly before Squarecast upgrades them.

## Document Definition

`SquarecastDocument` defines the durable board model:

- document type: `squarecast.board`;
- schema version: `1`;
- state validator: the existing `editorStateSchema`;
- command validator: the existing `editorOperationSchema`;
- reducer: immutable `EditorStateService` operations;
- summary: title and Card Pool count; and
- policy: semantic targets, coalescing keys, durability, and conflict labels.

The existing `EditorOperation` JSON representation and operation IDs are
unchanged. IndexedDB replay and Firestore transactions therefore read existing
records directly. No migration or dual-write path exists.

## Compatibility Boundary

The following Squarecast contracts remain application-owned and byte-for-byte
compatible:

- `#sq1:` compact tuple snapshots and legacy object decoding;
- `#sql1:`, `#sqb1:`, `#sqv1:`, `#sqp1:`, and `#sqi1:` routes;
- IndexedDB database, object-store, record, checkpoint, and outbox formats;
- Firestore document layout, publication tokens, invitations, and Security
  Rules behavior; and
- History API checkpoint and Back/Forward restoration behavior.

`StateCodec` delegates compression to the kit but retains Squarecast's compact
serializer and envelope-free legacy wire format. A golden test compares new
output against the original direct LZString algorithm.

The device and Firebase repositories continue as Squarecast compatibility
implementations. Replacing them with portable adapters requires separate
conformance fixtures proving identical stored records, authorization behavior,
revision semantics, offline replay, and route recovery.

## Upgrade Procedure

1. Read the kit package changelogs and protocol compatibility notes.
2. Update one capability package at a time.
3. Run focused command, codec, routing, and navigation tests.
4. Run `npm run check`, including Firestore emulator allow/deny tests.
5. Compare all existing URL and persistence golden fixtures before release.

Do not migrate or rewrite user data merely to adopt a new internal abstraction.
