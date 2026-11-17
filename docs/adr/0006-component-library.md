# ADR 0006: Component library

Date: 2026-11-17. Status: accepted (revisit if the theme work proves harder than expected).

## Context

The first screens use shadcn/ui (Base UI primitives, Tailwind 4). They look generic because the default theme was never
changed, not because of the library. The approved design (`docs/design/`) is mostly colour, type, spacing and radius.

## Options

1. **Keep shadcn/ui and theme it.** The components are source files in the repo, so they can be restyled freely. The
   design maps onto CSS variables. No new dependency, no migration of the working screens.
2. **A ready component library (for example Mantine).** Faster for complex widgets, but it brings its own theming
   system, a second styling approach next to Tailwind, and a rewrite of every existing screen.

## Decision

Keep shadcn/ui. Apply the Warm tokens to its CSS variables and adjust components where the prototype differs (row
height, dialog radius, badges). Reconsider only if a later feature needs a heavy widget (data grid, date range) that
shadcn does not cover; then add that one widget, not a whole library.

## Consequences

- The design is applied by editing `apps/web/src/index.css` and a few components, not by migrating screens.
- We keep owning the component code, which is more work for upgrades but gives full control of the look.
