<p align="center">
  <img src="public/og.png" alt="Squarecast — Build it. Cast it. Bingo." width="900">
</p>

# Squarecast

Squarecast is a static, URL-native bingo board studio. Build a square board, add more cards than it needs, lock important cards to a cell, row, or column, then send a play link. Each player gets a randomized board.

**Live site:** [mikejhill.github.io/squarecast](https://mikejhill.github.io/squarecast/)

No account, database, cookie, local storage, or backend is used. The complete editor or play session is compressed into the URL hash.

## Use Squarecast

1. Open the hosted site.
2. Choose a system, light, or dark appearance; board size; free-square setting; title; tile font size; and board color.
3. Add cards with the quick-add field. Press Enter after each card, or use **Paste CSV** to import multiple values.
4. Optionally constrain a card to a specific cell, row, or column.
5. Select **Test This Board** to test the board immediately, or select **Create Play Link** to share it.
6. Each recipient opens the launch link to create a fresh randomized board. Their marks are written back to their URL as they play.

The URL can be bookmarked or copied at any point. Editing one URL never changes a previously shared URL.

## Features

- 3×3 through 7×7 square boards
- Blank one-click board creation with a fresh randomized color
- Optional centered free square with a custom label
- Unlimited card pool with live minimum-count validation
- Exact-cell, row, and column placement rules
- Conflict detection before generation
- Seeded randomized boards with one-click reshuffling
- Automatic per-tile text fitting or a fixed custom tile font size
- Keyboard-friendly card entry and editing
- CSV import with quoted-value support
- Persistent card sorting, locked-card prioritization, and shuffling
- Win detection for rows, columns, and diagonals
- System, light, and dark site appearances
- Ten named board colors, a custom color picker, and color randomization
- Responsive editor and play layouts
- Compressed, schema-validated URL state
- Back and Forward restoration across major board transitions

## Development

Requirements:

- Node.js 20.19 or newer
- npm

Install and run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

Quality checks:

```bash
npm run check
```

`npm run check` runs strict TypeScript compilation, the production build, and
coverage-gated behavioral tests. Every domain source file must maintain at
least 90% statement and line coverage, 80% branch coverage, and 100% function
coverage.

Create a production build:

```bash
npm run build
```

The static output is written to `dist/`.

## Project structure

- `src/App.tsx` — editor, share flow, and play interface
- `src/lib/model.ts` — versioned schemas and default state
- `src/lib/codec.ts` — compressed URL encoding and decoding
- `src/lib/generator.ts` — validation, constrained randomization, and win detection
- `src/lib/csv.ts` — CSV card parser
- `src/lib/theme.ts` — appearance resolution, color palettes, contrast, and random colors
- `src/lib/sorting.ts` — card-pool sorting strategies
- `tests/` — behavioral tests for state, parsing, color logic, sorting, randomization, constraints, and wins
- `.github/workflows/deploy-pages.yml` — tested GitHub Pages deployment

## State and privacy

Squarecast writes application state only to `window.location.hash` with `history.replaceState`. It does not use `localStorage`, `sessionStorage`, cookies, tracking scripts, or network APIs.

Anyone who receives a Squarecast URL can read the board data embedded in it. Do not place secrets or sensitive information in a board.

## Contributing

1. Create a branch from `main`.
2. Make a focused change.
3. Add or update tests.
4. Run `npm run check`.
5. Open a pull request describing the behavior change and test coverage.

Keep the project fully static and URL-native. Do not add server state or browser storage.

## Architecture

Squarecast uses strict TypeScript and class-based application and domain
services. State encoding, parsing, board generation, sorting, appearance
resolution, identifiers, clipboard behavior, and application bootstrapping are
encapsulated behind typed classes. React components remain declarative views
and delegate stateful behavior to those services.

## License

MIT
