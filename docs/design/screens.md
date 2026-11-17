# Screens and their status

Status: **built** = in `apps/web` and matches the prototype; **approved** = prototype approved, not built;
**prototyped** = in `prototype/`, waiting for approval; **todo** = not designed yet.

| Screen / dialog | Prototype | App | Notes |
| --- | --- | --- | --- |
| Sign in / sign up | prototyped | built | Sign-up form is not in the prototype yet (same card, one more field) |
| App shell (header, nav, theme toggle) | prototyped | built | Theme follows the system until the toggle is used |
| Projects list (full, loading, empty, error) | prototyped | built | Cards. The document count is not shown: the API does not return it yet |
| New / Edit project dialog | prototyped | built | |
| Delete project dialog | prototyped | built | |
| Project page with tabs | prototyped | built | Analysis, Tasks, Settings tabs are placeholders; Edit/Delete are in the header |
| Documents tab (upload, statuses, failed, duplicate notice) | prototyped | built | |
| Delete document dialog | prototyped | built | |
| View text dialog | prototyped | built | Fixed header, scrolling content |
| Status page | todo | built (restyled by the theme only) | Not designed |
| AI analysis: run, progress, failed | todo | | Session 3 |
| Requirements table and detail panel | todo | | Session 3 |
| Gaps and contradictions | todo | | Session 3 |
| Tasks and Linear export | todo | | Session 4 |
| Usage (AI calls with tokens and cost) | approved | built | Data from the LiteLLM spend log via `/api/usage`. Operators only (`USAGE_ADMIN_EMAILS`, fail closed; others get 403 and no nav item) until calls are tagged with a project, then scope it per project |
