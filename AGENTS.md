# Squarecast Agent Guide

These instructions apply to the entire repository. They capture the durable
product, architecture, UX, quality, and delivery decisions for Squarecast.
Follow them when reviewing or changing the project.

## Product Mission

Squarecast is a static bingo board studio with portable URL snapshots, local
device libraries, and optional managed cloud collaboration. Users create a
source board, provide a Card Pool, apply optional placement rules, generate
randomized play boards, and mark cards in the browser.

The production application is:

- https://mikejhill.github.io/squarecast/

The repository is:

- https://github.com/mikejhill/squarecast

## Non-Negotiable Platform Constraints

- Keep the application fully static and compatible with GitHub Pages.
- Keep URL-only operation fully functional without Firebase.
- Preserve self-contained editor snapshots, launch templates, generated boards,
  and play progress under the `#sq1:` URL fragment format.
- Store device boards in IndexedDB. Store account boards only in Firebase
  Firestore. Never store board data in cookies, `localStorage`, or
  `sessionStorage`.
- Keep the device-local appearance preference (`system`, `light`, or `dark`) in
  `localStorage`.
- Do not add an application server, Cloud Functions, Firebase Hosting, Cloud
  Storage, or another server runtime. GitHub Pages remains the only web host.
- Do not add analytics, telemetry, remote logging, or third-party scripts that
  collect board URLs.
- Treat full Squarecast URLs as readable documents, not secrets.
- Treat account boards as access-controlled plaintext, not end-to-end encrypted
  content. Public links are bearer credentials.
- Use Firebase Authentication and Firestore directly from the browser. Do not
  make Firebase availability a prerequisite for URL or device operation.
- Keep Firebase configuration public and repository-controlled. Keep private
  credentials out of browser bundles and deploy rules/indexes through GitHub
  OIDC.

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
- Encode new links with the compact versioned tuple transport and retain
  decoding support for legacy object payloads.
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
- Preserve the complete route contract:
  - `#sq1:` self-contained snapshot, launch template, or play session
  - `#sql1:` IndexedDB board pointer
  - `#sqb1:` private Firestore board pointer
  - `#sqv1:` mutable read-only published view
  - `#sqp1:` mutable published source that becomes a fresh `#sq1:` play session
  - `#sqi1:` perpetual mutable editor link for guests or account editors
- Missing, unauthorized, revoked, or unavailable pointer routes show an
  explicit recoverable state. Never silently replace them with a new board.
- Keep pointer URLs stable. Store revision snapshots in `history.state` so Back
  and Forward can open a read-only historical view without rewriting storage.
- Render deterministic, non-destructive route transitions as real anchors.
  Intercept only unmodified primary activation; preserve native new-tab,
  modified-click, middle-click, context-menu, and browser link behavior.

See [State and Routing](docs/state-and-routing.md).

## Editor UX

- Board Setup is full-width.
- On desktop, Board Setup uses two rows of three equal-width fields:
  1. Board Title, Free Squares, Free Square Label
  2. Board Color, Tile Text Size, Board File
- Free Square Label remains visible and disabled when the free-square count is
  zero.
- Free-square counts range from zero through `size - 1`; reducing board size
  clamps the count automatically.
- Keep even-board free-square patterns central-first: 4×4 uses `[5, 3, 8]`
  and 6×6 uses `[14, 5, 6, 22, 27]` as zero-based indexes.
- Field labels use one consistent treatment. Secondary explanation belongs in
  accessible hover/focus tooltips.
- Card Pool and Live Preview are equal-width desktop columns.
- Card Pool and Live Preview must have equal outer height on desktop, with Live
  Preview as the height reference.
- The Card Pool list fills the remaining desktop panel height and scrolls
  internally; it must neither leave a blank region below it nor make the shared
  editor row taller.
- Give the Card Pool scroll region a visible themed border and inset surface in
  both light and dark appearances.
- Editor controls, tooltips, and decorative effects must not create horizontal
  page scrolling.
- Once the workspace stacks at responsive widths, both sections use independent
  natural heights; do not force equal mobile heights.
- On mobile, cap the Card Pool list relative to the viewport and give each card
  row a dedicated full-width second line for its placement selector.
- Do not impose a minimum page width. Hide the header wordmark before its
  controls can create horizontal overflow on narrow screens.
- Keep one page-level vertical scroller. Do not turn `<body>` into a nested
  scrolling viewport.
- Preserve one-pixel dimensions for `.sr-only` form controls with enough
  specificity to beat generic field-input rules.
- Board headings must use zero-minimum grid tracks and truncate their contents;
  header text must never contribute intrinsic width beyond the board.
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
- Card Pool sorting defaults to Manual Order. Deterministic sort modes reapply
  after additions, imports, text edits, and placement changes.
- Card position selectors are hidden by default. **Show Positions** and **Hide
  Positions** change portable saved editor state without deleting constraints.
- Keep Show/Hide Positions, Paste CSV, and Export CSV as accessible 34-pixel
  icon controls with keyboard tooltips. Keep the sort mode visible as text and
  keep the toolbar on one row without page overflow.
- Board Setup disclosure and preview seed are editor-session presentation.
  Preserve them when device/cloud acknowledgements or listeners merge saved
  state; never preserve shared `placementControlsVisible` during that merge.
- Live Preview remains available for incomplete boards and uses placeholders
  where necessary.
- **Shuffle Preview** works on partial boards and appears as a real button.
- **Copy Editor Link** appears directly below **Test This Board**.
- Validation errors block testing and publishing but do not block partial
  preview shuffling.
- Show the current storage boundary and sync state beside the editor. Preserve
  **Saved**, **Saving**, **Offline — Changes Pending**, **Conflict**, and
  **Cloud Unavailable** as accessible status messages.
- Saved boards expose Version History. Retain at most 25 named checkpoints,
  include a **Board Created** baseline, allow read-only viewing, and restore an
  older checkpoint only by writing a new head revision.

## Storage, Sharing, and Collaboration

- First meaningful edit promotes a URL board to On This Device while signed out
  or Saved To Account while signed in with a verified account. Allow explicit
  URL Only selection. Disclosure, appearance, dialogs, and preview shuffles do
  not promote.
- Existing device boards remain device-only after sign-in. Every move between
  repositories creates an independent copy and never deletes the source.
- **Copy Editor Link** and **Create Play Link** always produce self-contained
  `#sq1:` snapshots. Keep mutable cloud links in the owner-only Share dialog.
- Public view and play links follow the latest successful save until rotated or
  revoked. Public view is read-only. Public play creates a fresh concrete
  `#sq1:` session and never saves play progress.
- Anyone holding an active `#sqi1:` editor link can edit without signing in.
  Use Firebase Anonymous Authentication and a board-scoped active-token session
  for guest read/write access. Editor links never expire automatically; only
  rotation or revocation invalidates them.
- Give anonymous guests a deterministic, clearly labeled **Guest Adjective
  Creature NNN** name. Show it in their storage UI and collaborator presence.
  Do not persist extra guest profile data.
- Opening an editor link while signed in adds that account as an editor.
  Reopening it as an existing editor must retain access. Link revocation removes
  guest access but does not remove account editors.
- Only owners manage members, links, deletion, and ownership transfer. Keep the
  20-member limit. Transfer ownership only to an existing account editor.
- Apply cloud operations optimistically. Coalesce same-target typing after 1.5
  seconds idle with a five-second maximum delay, commit major operations
  immediately, transact against the current revision, and replay only
  unacknowledged operations from IndexedDB.
- Merge different targets. For same-target overlap, identify the affected field
  or Card, state that the local change is queued automatically, and confirm when
  it saves. Reject edit-after-delete without discarding recoverable local text.
- Keep the operation currently inside a Firestore transaction in the optimistic
  overlay until it is acknowledged. Filter overlay operations already present
  in `recentOperationIds`; an older listener snapshot must never make a rapid
  local field edit visibly regress.
- Presence uses one visible-session heartbeat per minute, immediate cleanup on
  hide/exit when possible, and a two-minute stale cutoff. Collapse multiple
  sessions with the same Firebase UID in the displayed editor list.
- Use the cloud board listener as the initial private-board read and the share
  listener as the initial public-view read. Do not add preliminary reads for
  either route, Share-dialog initialization, or link copying. Initialize App
  Check only immediately before the first Firestore operation. URL/device
  sessions must not request an App Check token.
- Every asynchronous Share action must disable conflicting actions, show its
  pending state, and report copy success or failure.

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
- Every free square is marked automatically and cannot be cleared.
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
- A sample has exactly `25 - free` distinct cards, where `free` is its
  configured count from zero through four.
- Samples use distinct IDs, titles, and accent colors.
- Sample content must be complete, unoffensive, casual, and independently
  themed.
- Additions must pass the catalog test and generate 25 populated play cells.

## Portable Data

- Complete-board JSON includes configuration and Card Pool in one versioned
  object.
- Current JSON writes version 2 with an integer `free` count and saved
  `placementControlsVisible`. Continue reading version 1 Boolean `free` values.
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
- Route persistence through `WorkspaceSession`, `BoardRepository`, and the
  IndexedDB/Firestore adapters. Persist all meaningful mutations as validated
  `EditorOperation` values interpreted by one immutable domain service.
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
  public/editor tokens, clipboard content, imported file content, or Firebase
  documents.
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
- Storage/collaboration changes require IndexedDB tests and adjacent allow/deny
  Firestore emulator tests, including guest access, token rotation/revocation,
  membership limits, presence, checkpoints, and revision monotonicity.
- Free-square changes require schema, editor clamping, deterministic layout,
  generator, compact codec, JSON compatibility, sample, and play tests.

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
- Verify the conditional Firestore policy job succeeds when its OIDC variables
  are configured.
- Report the live site, commit, validation result, and deployment workflow.
