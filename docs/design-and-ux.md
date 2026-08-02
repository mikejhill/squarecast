# Design and UX

Squarecast is designed to make a configurable board understandable without
turning the editor into a specialist tool. The interface separates board-wide
decisions, Card Pool work, and the generated result while keeping them visible
in one workspace.

## Product Principles

### Keep the primary flow visible

The editor prioritizes three tasks:

1. configure the board;
2. build and validate the Card Pool; and
3. inspect and share the result.

Board Setup spans the page width. Card Pool and Live Preview remain side by
side on larger screens so editing retains immediate visual feedback.

### Reveal detail when it becomes relevant

Persistent copy is reserved for information required to complete the task.
Secondary explanations use accessible hover/focus tooltips. Placement rules
live with individual cards, and validation appears near the preview and
publishing actions it affects.

### Make storage explicit

Every editor identifies itself as **URL Only**, **On This Device**, or **Saved
To Account**. First-edit promotion is visible and overridable. Copying between
modes creates an independent copy. Snapshot links remain available in every
mode, including cloud failure.

### Allow imperfect work in progress

An incomplete board still produces a partial preview. Publishing and test-play
actions remain disabled until validation errors are resolved, but exploration
and preview shuffling continue to work.

## User Flow

```mermaid
flowchart LR
    A["Open sample or new board"] --> B["Configure Board Setup"]
    B --> C["Build Card Pool"]
    C --> D["Add optional placement rules"]
    D --> E["Review live preview and validation"]
    E --> F["Test board"]
    E --> G["Create play link"]
    F --> H["Return to Edit This Board"]
    G --> I["Player opens a fresh randomized board"]
    I --> J["Mark cells and detect Bingo"]
```

## Editor Information Architecture

### Global header

The header contains navigation and device-level controls:

- Squarecast home link;
- system, light, and dark appearance;
- fresh-board creation;
- random sample selection;
- current mode label; and
- My Boards;
- Sign In or account management; and
- repository link.

Appearance belongs here because it is a browser preference, not a board
property.

### Board Setup

Board Setup contains settings that affect the whole board:

- title;
- square dimension;
- optional centered free square and label;
- board color;
- automatic or fixed tile text sizing; and
- complete-board JSON import and export.

Related settings share rows on desktop and stack at narrow widths.
The section can be collapsed after setup, and its disclosure state follows the
restorable editor URL.

### Card Pool

Card Pool supports multiple entry styles:

- type a card and press Enter;
- add with the visible button;
- paste CSV;
- drop CSV files anywhere on the panel;
- edit in place;
- delete;
- sort; and
- assign a placement constraint.

Card position dropdowns are hidden by default. **Show Positions** exposes them
without changing existing constraints; **Hide Positions** removes the controls
while retaining every saved row, column, and exact-cell rule. The toggle is
part of saved editor state and is shared through URL, device, cloud, history,
and complete-board JSON persistence.

Manual Order is the default. New cards append to the pool; choosing a
deterministic sort mode reapplies that ordering after additions and edits.
Pressing Enter while editing an existing card commits the edit without creating
another card.

Duplicate text remains permitted because some boards intentionally repeat a
card. It is treated as a warning, with affected cards identified directly in
the pool.

### Live Preview

The preview combines:

- preview shuffling;
- the current board;
- validation status (**Ready to Play** when complete);
- immediate test play; and
- a prominent editor-link action;
- play-link creation.

The editor snapshot link stays prominent because it is the portable recovery
and immutable-sharing mechanism.

### Storage status

The storage/status bar identifies the active persistence boundary and announces
**Saved**, **Saving**, **Offline — Changes Pending**, **Conflict**, or **Cloud
Unavailable** through an accessible status region. It provides independent-copy
actions, cloud sharing for owners, and version history. Version History lists
the current and retained revisions with separate **View** and **Restore**
actions. A historical snapshot is visibly read-only until restored as a new
revision or dismissed with **Return To Current**.

Same-target collaboration notices name the affected Board Setup field, Card,
Card Pool operation, or complete Board. They state that the local operation is
queued automatically, require no manual submission, and change to a resolved
message after the local operation saves.

### My Boards and account

**My Boards** keeps Account and This Device in separate sections. Each row shows
title, role, modified time, and Open, Duplicate, and confirmed Delete actions.
Signing in never absorbs device boards. Account deletion is explicit, removes
or leaves all memberships before authentication, and is blocked by pending
changes or failed cleanup.

### Cloud sharing

The owner-only Share dialog separates mutable live view, mutable live play, and
editor links. Public links can be copied, rotated, or revoked independently.
Editor links state that anyone holding the active token can edit without an
account and that the token remains active until rotated or revoked. Creating a
link reuses an existing active token; only the explicit Rotate action
invalidates it. Every asynchronous action exposes progress and reports copy
success or failure. Collaborator removal and ownership transfer remain
distinct.

Public view is read-only and offers **Play This Board** and **Edit a Copy**.
Public play resolves the latest source into a fresh URL-only session.

## Action Ordering

Horizontal action groups follow one stable convention:

- the primary or forward action appears on the left; and
- the secondary, cancellation, or dismissal action appears on the right.

Dialog actions use the available row width to reinforce this separation.
Peer actions without a primary/dismissal relationship retain task order.

## Play Experience

Play mode reduces the interface to the active board and a small action bar.
Players can:

- mark or unmark cells;
- generate another shuffle;
- copy the exact session;
- return to the source editor; and
- see completed lines highlighted.

The Bingo toast is positioned as an overlay above the board heading so it does
not move the board or change page layout.

## Typography and Tile Fitting

Text-only cells must remain readable without clipping.

- **Auto** measures each tile independently against its rendered container.
- The maximum automatic size is capped so short labels do not dominate a board.
- Wrapping is browser-driven and remeasured when the tile or loaded fonts
  change.
- **Fixed** applies one explicit size to the complete board.

Text fitting is documented technically in
[Architecture](architecture.md#rendered-text-fitting).

## Color and Appearance

Board color and site appearance are separate concepts:

- board color is shareable board state;
- site appearance is a device-local preference.

The application offers preset board colors, a custom color picker, and color
randomization. Contrast utilities derive readable foreground and supporting
colors from the selected accent.

System appearance is the default. The root element exposes a correct
`color-scheme`, allowing native controls and tools such as Dark Reader to
recognize the active appearance.

## Accessibility

UI changes should preserve:

- visible keyboard focus;
- labels for icon-only controls;
- native buttons, inputs, and selects;
- `aria-pressed` for toggle-like controls and board cells;
- status or alert roles for meaningful feedback;
- keyboard-accessible tooltips;
- adequate light and dark contrast;
- reduced-motion handling; and
- readable controls at touch sizes.

Board state must not be communicated by color alone. Checked cells, duplicate
warnings, validation results, and winning lines all include structural or icon
cues.

## Responsive Behavior

The desktop editor uses a full-width setup band followed by a two-column
workspace. Card Pool and Live Preview share the same outer height while they
are side by side, with Live Preview acting as the height reference. Card Pool
contents must not make that shared row taller. Its list consumes only the
remaining bounded panel height and scrolls internally; the page itself must not
gain horizontal overflow from editor content, floating tooltips, or decorative
effects. At narrower widths, both sections return to their natural
content-driven heights and:

- Card Pool and Live Preview stack;
- the Card Pool list uses a shorter viewport-relative scroll cap;
- the Card Pool list has a themed inset boundary that identifies it as an
  independent scroll region;
- each Card Pool row reserves a full second line when position controls are shown
  and collapses to one compact row when they are hidden;
- multi-column setup fields collapse;
- the Squarecast wordmark yields to header controls before their combined
  minimum width can enlarge the page;
- visually hidden native controls retain one-pixel dimensions even when nested
  inside broadly styled form fields;
- board-heading tracks may shrink below their contents' intrinsic widths, with
  long labels truncated inside the board rather than widening the document;
- Card Pool rows preserve saved placement settings even when their controls are hidden; and
- board cells preserve a square aspect ratio.

Responsive changes should retain task order. Reflow may change columns, but
Board Setup must still precede Card Pool, and Card Pool must precede Live
Preview.

## Content Guidelines

- Use direct, neutral language.
- Use **Card** for Card Pool entries.
- Use **Board** for the complete grid or its configuration.
- Name actions by their outcome: **Test This Board**, **Create Play Link**,
  **Copy Editor Link**.
- Avoid jokes at the expense of professions, groups, or routine obligations.
- Sample boards should be broadly usable, complete, and independently themed.
- Keep permanent instructional text short; move secondary explanation to
  contextual help.

## Reviewing UX Changes

Check each change against these questions:

1. Is the primary action visible where the decision is made?
2. Does the change add vertical height or persistent copy that could be
   contextual instead?
3. Can the interaction be completed with a keyboard?
4. Does it work in light, dark, and system appearance?
5. Does it preserve URL restoration and browser history?
6. Does an incomplete board remain understandable and recoverable?
