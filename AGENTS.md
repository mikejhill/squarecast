# Squarecast Agent Guide

These instructions apply to the entire repository. They capture the durable
product, architecture, UX, quality, and delivery decisions for Squarecast.
Follow them when reviewing or changing the project.

## Product Mission

Squarecast is a static, URL-native bingo board studio. Users create a source
board, provide a Card Pool, apply optional placement rules, generate randomized
play boards, and mark cards in the browser.

The production application is:

- https://mikejhill.github.io/squarecast/

The repository is:

- https://github.com/mikejhill/squarecast

## Non-Negotiable Platform Constraints

- Keep the application fully static and compatible with GitHub Pages.
- Do not add a backend, database, account system, server session, or remote
  persistence.
- Store editor state, launch templates, generated boards, and play progress in
  the URL fragment.
- Do not store board data in cookies, `localStorage`, `sessionStorage`,
  IndexedDB, or another browser store.
- The only browser-storage exception is the device-local appearance preference:
  `system`, `light`, or `dark` in `localStorage`.
- Do not add analytics, telemetry, remote logging, or third-party scripts that
  collect board URLs.
- Treat full Squarecast URLs as readable documents, not secrets.

## Product Language

- Use **Card** for one possible square and **Card Pool** for the collection.
- Do not use **Answer** in user-facing copy.
- Use **Board** for the complete grid or its configuration.
- Use direct outcome-based action labels, including:
  - **Test This Board**
  - **Create Play Link**
  - **Copy Editor Link**
  - **Edit This Board**
- Use Title Case for primary headings.
- Keep copy neutral, broadly usable, and professional.
- Do not create sample content that mocks professions, meetings, communities,
  or other groups.

## URL State and Navigation

- Keep state schemas versioned and runtime-validated with Zod.
- Keep encoded board state under the `#sq1:` fragment prefix.
- Preserve `#new` as an action route that creates fresh defaults and a random
  board color.
- The hash-free front page must open a random curated sample.
- A play link stores a launch template. Each opening must create a fresh
  randomized play board.
- A play state must retain its source editor so **Edit This Board** can return
  to it.
- Major transitions use `pushState`; high-frequency edits use `replaceState`.
- Major history checkpoints include:
  - New Board
  - Sample Board
  - Test This Board
  - Edit This Board
  - complete-board JSON import
  - meaningful Card Pool deletion, sorting, or bulk import
- Back and Forward restoration must not immediately rewrite the restored entry.

See [State and Routing](docs/state-and-routing.md).

## Editor UX

- Board Setup is full-width.
- On desktop, Board Setup uses two rows of three equal-width fields:
  1. Board Title, Free Square, Free Square Label
  2. Board Color, Tile Text Size, Board File
- Free Square Label remains visible and disabled when the free square is off.
- Field labels use one consistent treatment. Secondary explanation belongs in
  accessible hover/focus tooltips.
- Card Pool and Live Preview are equal-width desktop columns.
- Card Pool and Live Preview must have equal outer height on desktop, with Live
  Preview as the height reference.
- The Card Pool list fills the remaining desktop panel height and scrolls
  internally; it must neither leave a blank region below it nor make the shared
  editor row taller.
- Editor controls, tooltips, and decorative effects must not create horizontal
  page scrolling.
- Once the workspace stacks at responsive widths, both sections use independent
  natural heights; do not force equal mobile heights.
- On mobile, cap the Card Pool list relative to the viewport and give each card
  row a dedicated full-width second line for its placement selector.
- Do not impose a minimum page width. Hide the header wordmark before its
  controls can create horizontal overflow on narrow screens.
- Card Pool must support:
  - Enter-to-add
  - visible Add action
  - inline editing and deletion
  - persistent sorting
  - CSV paste
  - CSV drag-and-drop across the panel
  - CSV export
  - duplicate warnings beside affected cards
  - exact-cell, row, and column constraints
- Card Pool sorting defaults to alphabetical and reapplies after additions.
- Live Preview remains available for incomplete boards and uses placeholders
  where necessary.
- **Shuffle Preview** works on partial boards and appears as a real button.
- **Copy Editor Link** appears directly below **Test This Board**.
- Validation errors block testing and publishing but do not block partial
  preview shuffling.

## Action Ordering

- In horizontal action groups, place the primary or forward action on the left.
- Place the secondary, cancellation, or dismissal action on the right.
- Modal action rows visually separate these positions.
- Examples:
  - Import Cards, then Cancel
  - Open play board, then Close
  - New Board, then Sample Board
- Peer actions without a primary/dismissal relationship retain task order.

## Play UX

- Players mark and unmark cards directly.
- The free square is marked automatically and cannot be cleared.
- Detect completed rows, columns, and diagonals.
- Highlight every checked cell belonging to a completed line.
- Show the Bingo banner as an overlay above the board heading.
- The Bingo banner must not add page height, move the board, or cover the title
  after its entrance animation.
- Preserve New Shuffle, Copy Session, and Edit This Board actions.

## Typography, Color, and Appearance

- Board cells contain text only.
- Auto text sizing is the default.
- Auto sizing measures actual rendered layout for every tile independently.
- Do not replace rendered measurement with character-count guessing.
- Keep the automatic maximum capped so short cards do not dominate the board.
- Fixed mode applies one explicit size to the complete board.
- Site appearance and board color are separate concepts:
  - appearance is a device-local preference;
  - board color is shared board state.
- System appearance is the default.
- Keep `color-scheme` correct so native controls and tools such as Dark Reader
  detect the active mode.
- Theme every control in light and dark appearances, including `<option>`
  elements.
- The visible named palette is intentionally compact. Legacy theme identifiers
  may remain schema-compatible even when they are not picker presets.

## Samples

- Every curated sample is 5×5.
- A sample with a free square has exactly 24 distinct cards.
- A sample without a free square has exactly 25 distinct cards.
- Samples use distinct IDs, titles, and accent colors.
- Sample content must be complete, unoffensive, casual, and independently
  themed.
- Additions must pass the catalog test and generate 25 populated play cells.

## Portable Data

- Complete-board JSON includes configuration and Card Pool in one versioned
  object.
- Validate the entire JSON document before replacing editor state.
- Generate fresh internal card IDs on JSON import.
- CSV contains Card Pool text only and exports one card per row.
- Preserve quoted commas, quotes, and line breaks through CSV round trips.
- File import and export remain local to the browser.

See [Data Formats](docs/data-formats.md).

## Architecture and Source Design

- Use strict TypeScript throughout.
- Preserve the existing layered direction:
  - React feature views
  - controllers
  - domain services
  - typed model and schemas
  - focused browser adapters
- React function components are appropriate for declarative rendering and
  hooks.
- Put stateful behavior, policies, and reusable rules in focused classes.
- Do not move generation, sorting, encoding, history policy, or persistence
  rules into React components.
- Keep domain mutations immutable.
- Wrap direct browser side effects in `src/services/`.
- Construct long-lived dependencies in `ApplicationServices`.
- Separate abstractions into focused files instead of expanding `App.tsx`.
- Add meaningful class- and method-level JSDoc that explains responsibility,
  invariants, and failure behavior.
- Avoid comments that merely restate syntax.

See [Architecture](docs/architecture.md) and
[Development](docs/development.md).

## Logging and Privacy

- Use `RuntimeLogger` and scoped `loglevel` loggers.
- Production logging remains fixed at `warn`.
- Use `debug` and `info` to document normal flow without production console
  noise.
- Use `warn` for recoverable degradation.
- Use `error` for failed operations and broken invariants.
- Never log card text, board titles, full state, encoded hashes, share URLs,
  clipboard content, or imported file content.
- Do not add a remote log transport.

See [Operations](docs/operations.md).

## Testing and Quality

- Add meaningful behavioral tests for every changed contract.
- Avoid trivial tests that only repeat implementation constants.
- Keep documentation-link validation passing.
- Per-file coverage gates are:
  - 90% statements
  - 90% lines
  - 80% branches
  - 100% functions
- Run the complete gate before handoff:

```bash
npm run check
```

- `npm run check` must pass tests, coverage, strict TypeScript compilation, and
  the production build.

## Documentation

- Keep the root README concise, stable, and useful to most visitors.
- Do not use the README as a chronological change log.
- Put deeper technical material in `docs/`.
- Update documentation when a durable product, architecture, compatibility,
  operational, or contribution contract changes.
- Keep Mermaid diagrams and local Markdown links valid.

## Delivery

- Preserve unrelated user changes in a dirty worktree.
- Commit only the scoped change.
- Push completed work to `main` when publication is part of the task.
- Verify the GitHub Pages workflow reaches a successful conclusion.
- Report the live site, commit, validation result, and deployment workflow.
