# Design prototype

The clickable design source of truth for the app (roadmap phase 3.5). It uses the approved **Warm** direction
(`docs/design/principles.md`, `docs/design/tokens.md`) and fake data.

**Rule: every new screen, dialog or behaviour is designed and approved here before it is implemented in `apps/web`.**
It is throwaway code and is never imported by the app. What is kept are the decisions: `docs/design/screens.md`.

Run it (or use the `prototype` entry in `.claude/launch.json`):

```bash
python3 -m http.server 5180 --directory prototype
```

Open http://localhost:5180. The bar at the bottom switches **theme** (light/dark) and **state** (full, loading, empty,
error). `?theme=dark&state=empty#projects` opens a screen directly.

## How to add a feature

1. Add fake data at the top of `prototype.js` and a render function for the screen; register it in `render()`'s page map
   and link it from the shell or a tab.
2. Make it respect `S.state` (full, loading, empty, error), plus any feature-specific states (partial failure, etc.).
3. Dialogs go through the `D` object and `dialogHtml()`; confirmations say what happens and whether it can be undone.
4. Use only the tokens in `tokens.css` (no raw colours). A new token is added there first.
5. Check light and dark and a phone width, then add the screen to `docs/design/screens.md` as *prototyped*.
6. After approval mark it *approved*; once implemented and matching, *built*.
