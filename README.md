# Squarecast

Squarecast is a static, URL-native bingo board studio. Build a square board, add more answers than it needs, lock important answers to a cell, row, or column, then send a play link. Each player gets a randomized board.

No account, database, cookie, local storage, or backend is used. The complete editor or play session is compressed into the URL hash.

## Use Squarecast

1. Open the hosted site.
2. Choose a board size, free-square setting, title, and color theme.
3. Add answers with the quick-add field. Press Enter after each answer, or use **Paste CSV** to import multiple values.
4. Optionally constrain an answer to a specific cell, row, or column.
5. Select **Create play link** and share it.
6. Each recipient opens the launch link to create a fresh randomized board. Their marks are written back to their URL as they play.

The URL can be bookmarked or copied at any point. Editing one URL never changes a previously shared URL.

## Features

- 3×3 through 7×7 square boards
- Optional centered free square with a custom label
- Unlimited answer pool with live minimum-count validation
- Exact-cell, row, and column placement rules
- Conflict detection before generation
- Seeded randomized boards with one-click reshuffling
- Auto-fitting text in every board cell
- Keyboard-friendly answer entry and editing
- CSV import with quoted-value support
- Win detection for rows, columns, and diagonals
- Four accessible visual themes
- Responsive editor and play layouts
- Compressed, schema-validated URL state

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
- `src/lib/csv.ts` — CSV answer parser
- `tests/` — unit tests for state, parsing, randomization, constraints, and wins
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

## License

MIT
