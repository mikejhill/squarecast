# Data Formats

Squarecast supports two portable file formats in addition to its URL-native
state:

- a versioned JSON document for a complete editable board; and
- a CSV file for Card Pool text only.

Files are read and generated locally in the browser.

## Complete Board JSON

Use JSON when board settings, Card Pool content, and placement constraints must
move together.

### Shape

```json
{
  "format": "squarecast-board",
  "version": 1,
  "config": {
    "title": "Neighborhood Photo Hunt",
    "size": 5,
    "free": true,
    "freeLabel": "FREE",
    "theme": "teal",
    "accentColor": "#008b8b",
    "fontMode": "auto",
    "fontSize": 18,
    "sortMode": "alphabetical",
    "previewSeed": "example-preview"
  },
  "cards": [
    {
      "text": "A bright front door",
      "placement": {
        "kind": "any"
      }
    },
    {
      "text": "A local landmark",
      "placement": {
        "kind": "row",
        "index": 0
      }
    }
  ]
}
```

### Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | string | Must be `squarecast-board` |
| `version` | number | Current document version |
| `config` | object | Complete board configuration |
| `cards` | array | Card text and placement rules |

### Configuration

| Field | Constraint |
| --- | --- |
| `title` | String |
| `size` | Integer from 3 through 7 |
| `free` | Boolean |
| `freeLabel` | String |
| `theme` | Supported preset identifier or `custom` |
| `accentColor` | Six-digit hexadecimal color |
| `fontMode` | `auto` or `fixed` |
| `fontSize` | Integer from 10 through 32 |
| `sortMode` | `alphabetical`, `reverse`, `constrained`, or `shuffle` |
| `previewSeed` | Non-empty string |

### Placement rules

```json
{ "kind": "any" }
```

```json
{ "kind": "cell", "index": 7 }
```

```json
{ "kind": "row", "index": 2 }
```

```json
{ "kind": "column", "index": 3 }
```

Indexes are zero-based. Cell indexes use row-major order.

### Import behavior

The complete JSON object is validated before the current editor changes.
Invalid JSON, unsupported format identifiers or versions, invalid colors,
out-of-range board sizes, and malformed placement rules are rejected.

Imported cards receive fresh internal IDs. IDs identify one editor session and
are deliberately excluded from the portable format.

A successful import creates a browser-history checkpoint, allowing the prior
board to be restored with Back.

## Card Pool CSV

Use CSV when only card text must move between Squarecast and a spreadsheet or
text editor.

Squarecast exports one card per row:

```csv
A bright front door
"A mural with red, blue, and yellow"
"A sign that says ""Welcome"""
```

The parser supports:

- comma-separated fields;
- multiple columns;
- line-separated values;
- Windows and Unix line endings;
- quoted commas;
- escaped double quotes; and
- quoted line breaks.

Every non-empty field becomes one card. Surrounding whitespace is trimmed.

CSV does not contain:

- board configuration;
- free-square settings;
- color or typography;
- placement constraints; or
- sort mode.

Use complete-board JSON when those values must be preserved.

## File Names

Exports derive a safe lowercase filename from the board title:

```text
neighborhood-photo-hunt.squarecast.json
neighborhood-photo-hunt.cards.csv
```

If the title cannot produce a usable filename, Squarecast uses
`squarecast-board`.

## URL State Is a Separate Format

The compressed `#sq1:` representation is optimized for sharing and restoration.
It contains editor, launch, or play state and should be treated as an internal
application format.

Do not build integrations by editing compressed fragments. Use the versioned
JSON format for complete boards or CSV for Card Pools.

## Compatibility Rules

Changes to portable formats should follow these rules:

1. Keep the format identifier stable for compatible changes.
2. Add schema defaults when an omitted field has an unambiguous meaning.
3. Increment `version` for incompatible document changes.
4. Reject unknown incompatible versions.
5. Add round-trip and rejection tests for every format change.
6. Never serialize browser-only preferences into a board file.

## Related Documents

- [State and Routing](state-and-routing.md)
- [Development](development.md)
