# Squarecast Documentation

This directory contains the implementation and product documentation for
Squarecast. The project README remains the primary introduction for users and
contributors; these guides explain the decisions and contracts behind it.

## Guides

| Document | Audience | Contents |
| --- | --- | --- |
| [Architecture](architecture.md) | Maintainers | Runtime layers, dependency composition, state model, board generation, and browser adapters |
| [Design and UX](design-and-ux.md) | Designers and frontend contributors | Product principles, information architecture, interaction behavior, accessibility, and responsive design |
| [State and Routing](state-and-routing.md) | Maintainers | URL encoding, editor/launch/play states, special routes, browser history, and storage boundaries |
| [Data Formats](data-formats.md) | Users building integrations and maintainers | Portable JSON boards, CSV Card Pools, compatibility, and validation |
| [Development](development.md) | Contributors | Repository layout, local workflow, coding conventions, testing, and common change patterns |
| [Operations](operations.md) | Maintainers | Runtime logging, privacy, CI/CD, GitHub Pages deployment, diagnostics, and recovery |

## Suggested Reading Paths

For a first contribution:

1. [Development](development.md)
2. [Architecture](architecture.md)
3. The guide for the affected feature

For state, sharing, or navigation changes:

1. [State and Routing](state-and-routing.md)
2. [Architecture](architecture.md)
3. [Data Formats](data-formats.md)

For UI changes:

1. [Design and UX](design-and-ux.md)
2. [Architecture](architecture.md)
3. [Development](development.md)

For deployment or production diagnosis:

1. [Operations](operations.md)
2. [State and Routing](state-and-routing.md)
