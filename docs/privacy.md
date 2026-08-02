# Privacy

Squarecast supports three explicit storage boundaries. Moving a board between
them creates an independent copy and never silently deletes the source.

| Mode | Storage | Access |
| --- | --- | --- |
| URL Only | `#sq1:` fragment | Anyone holding the complete URL |
| On This Device | IndexedDB | The current browser profile on this device |
| Saved To Account | Firebase Firestore | Verified owner and invited editors |

## Local Data

URL-only editor snapshots, launch templates, and play progress remain in the
fragment. Device boards and unacknowledged cloud operations use IndexedDB.
Appearance uses `localStorage`. Squarecast does not use cookies,
`sessionStorage`, analytics, telemetry, or remote logging.

Deleting a device board removes its record and embedded checkpoints. Clearing
site data through the browser also removes device boards and pending operations.

## Account Data

Account boards are access-controlled plaintext. They are not end-to-end
encrypted. Firebase can technically access stored content. A board document
contains the compact editor payload, plaintext title, membership roles,
revision and operation metadata, active sharing references, timestamps, and the
last editor identifier.

Only verified account members can read a private board. Owners manage public
links, invitations, members, deletion, and ownership transfer. Editors can
change board content but cannot manage access.

Squarecast uses Google sign-in or verified email/password authentication.
Authentication persistence is managed by Firebase Auth.

## Sharing

`#sqv1:` public-view and `#sqp1:` public-play routes contain 128-bit bearer
tokens. Anyone holding an active token can retrieve its published copy. Public
documents cannot be listed. Owners can rotate or revoke view and play tokens
independently.

An `#sqi1:` invitation also uses a random token, expires seven days after
creation, and requires a verified signed-in account. Revocation blocks later
joins but does not remove editors who already accepted. Removing an editor is a
separate owner action.

Public play creates a fresh board from the latest published source and then
replaces the pointer route with a self-contained URL play session. Play marks
never enter account or device libraries.

## Retention And Deletion

Saved boards retain at most 25 meaningful checkpoints. Cloud presence records
are treated as expired after two minutes and cleaned opportunistically.

Deleting an owner-managed account board removes public links, invitations,
checkpoints, presence, and the board. Deleting a shared board as an editor
removes that account's membership. Account deletion first deletes owned boards
and removes remaining memberships; authentication is deleted last. Cleanup or
pending-save failure blocks account deletion so export and retry remain
available.

## Operational Boundaries

Firebase configuration is public by design. Firestore Security Rules and App
Check protect access; configuration values are not credentials. App Check must
be monitored before enforcement. Squarecast keeps production logging at
`warn` and never logs board titles, card text, state payloads, tokens, or URLs.

Do not place secrets or regulated sensitive information in any Squarecast
board. URL snapshots and public bearer links are readable documents.
