# Design principles

The approved direction is **Warm**: warm paper background, terracotta accent, serif headings, calm and readable.
Chosen on 2026-11-17 from three prototypes (Calm, Warm, Contrast).

1. **Calm and readable first.** Generous rows (48 px), 14 px text, soft borders. People read requirements and quotes
   here, so reading comfort beats density.
2. **One accent colour.** Terracotta marks the primary action and the current place. Everything else is neutral.
   Red, amber and green are reserved for status.
3. **AI output looks different from human decisions.** A suggestion is never styled like a confirmed fact: it carries a
   badge and a visible status until a person confirms it.
4. **Evidence next to the claim.** Every AI statement shows its source quote and a way to jump to it.
5. **Every state is designed.** Loading, empty, error and partial failure are part of each screen, not extras.
6. **Destructive and outward actions confirm first**, and say what will happen and whether it can be undone.
7. **Works in light and dark, and on a phone.**

## Prototype first

Every new feature is designed and approved in `prototype/` **before** it is implemented in `apps/web`. The prototype
is throwaway code; the decisions it produces are kept (`docs/design/screens.md`). See `prototype/README.md`.
