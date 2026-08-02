<p align="center">
  <img src="public/og.png" alt="Squarecast — Build it. Cast it. Bingo." width="900">
</p>

# Squarecast

[![Deploy Squarecast to GitHub Pages](https://github.com/mikejhill/squarecast/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/mikejhill/squarecast/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Squarecast is a browser-based bingo board studio for creating, randomizing,
sharing, and playing custom boards. Boards can remain self-contained in a URL,
be saved privately in the current browser, or sync through an optional account.
The site remains a static GitHub Pages application.

[Open Squarecast](https://mikejhill.github.io/squarecast/) ·
[Start with a blank board](https://mikejhill.github.io/squarecast/#new)

## How It Works

1. Start with a curated sample or a blank board.
2. Configure the board and build a Card Pool—the list of possible squares.
3. Add optional rules that place specific cards in a cell, row, or column.
4. Test a randomized board and resolve any validation issues.
5. Create a play link. Each player receives an independently randomized board.

Players mark cards directly in the browser. Their board and progress remain in
the URL, which can be copied or bookmarked at any time.

## Features

- Square boards from 3×3 through 7×7
- Optional centered free square with a custom label
- Curated 5×5 sample boards
- Card Pools with no fixed maximum and persistent sorting
- Exact-cell, row, and column placement constraints
- Live validation and partial-board previews
- Seeded randomization and one-click reshuffling
- Automatic per-tile text fitting based on rendered measurements
- Light, dark, and system appearance modes
- Custom board colors and accessible contrast handling
- Complete-board JSON import and export
- Card Pool CSV import, export, paste, and drag-and-drop
- URL-aware Back and Forward navigation
- URL-only, device, and optional account storage
- Mutable public view/play links and verified editor invitations
- Optimistic collaboration, offline pending changes, and version history
- Responsive editing and play layouts

## Privacy

URL-only boards and play sessions stay in the URL. Device boards and pending
cloud operations use IndexedDB. Account boards use access-controlled Firebase
Firestore documents. Cloud content is plaintext to Firebase, not end-to-end
encrypted. Public view/play links are bearer links readable by anyone holding
the token.

Appearance is the only value in `localStorage`. Squarecast has no analytics,
telemetry, remote logging, cookies, or application server. See the
[privacy model](docs/privacy.md).

## Local Development

Squarecast requires Node.js 20.19 or newer, npm, and Java 21 for Firestore
Security Rules tests.

```bash
npm ci
npm run dev
```

Run the complete quality gate before submitting a change:

```bash
npm run check
```

This runs Firestore emulator rules tests, the coverage-gated test suite, strict
TypeScript compilation, and the production build.

## Documentation

Technical documentation lives in [`docs/`](docs/README.md).

| Guide | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Runtime layers, service boundaries, state model, and generation algorithm |
| [Design and UX](docs/design-and-ux.md) | Interaction principles, editing and play flows, accessibility, and responsive behavior |
| [State and Routing](docs/state-and-routing.md) | URL state, action routes, browser history, launch links, and privacy boundaries |
| [Data Formats](docs/data-formats.md) | JSON board documents, CSV Card Pools, validation, and compatibility |
| [Development](docs/development.md) | Repository structure, coding conventions, testing, and contribution workflow |
| [Operations](docs/operations.md) | Logging, CI/CD, deployment, diagnostics, and recovery |
| [Privacy](docs/privacy.md) | Storage boundaries, cloud access, public links, and deletion |

## Contributing

Issues and pull requests are welcome. Keep changes focused, preserve the
static and URL-compatible architecture, add meaningful tests for behavioral
changes, and run `npm run check` before opening a pull request.

See the [development guide](docs/development.md) for repository conventions and
the [design and UX guide](docs/design-and-ux.md) for product constraints.

## License

Squarecast is available under the [MIT License](LICENSE).
