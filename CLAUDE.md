# Delivery Copilot

Monorepo for the AI Project Delivery Copilot MVP. The plan, phases and questions live in the roadmap artifact:
https://claude.ai/artifact/7x2Uv2SkSpEDijn27vCkxq

The user is learning while building. At the end of every roadmap phase (all session tasks done), offer to run
`/phase-quiz <phase>` before starting the next phase.

## Design: prototype first

The approved design is "Warm" (`docs/design/principles.md`, `docs/design/tokens.md`). The clickable prototype in
`prototype/` is the design source of truth.

- Before implementing any new screen, dialog or user-facing behaviour in `apps/web`, design it in `prototype/` first
  (fake data, all states: loading, empty, error, full) and get the user's approval. Then implement it.
- When the real app and the prototype differ, the prototype wins; fix the app, or change the prototype first.
- Record each screen's status (prototyped, approved, built) in `docs/design/screens.md`.
- `prototype/` is throwaway code and is never imported by the app. Run it with `python3 -m http.server 5180 --directory prototype`.
