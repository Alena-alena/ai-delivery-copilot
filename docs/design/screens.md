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
| Project page with tabs | prototyped | built | Tasks and Settings tabs are placeholders; Edit/Delete are in the header |
| Documents tab (upload, statuses, failed, duplicate notice) | prototyped | built | |
| Delete document dialog | prototyped | built | |
| View text dialog | prototyped | built | Fixed header, scrolling content |
| Status page | todo | built (restyled by the theme only) | Not designed |
| AI analysis: run, progress, failed | approved | built (requirements step) | Run confirmation with estimate, progress, cancel, re-run keeps edited and confirmed items. A failed run saves nothing and earlier results stay. Only the requirements step exists so far; gaps and contradictions come next |
| Requirements table and detail panel | approved | built | Filters by status, bulk confirm, side panel with the verified quote, Confirm / Needs clarification / Reject / Edit. Statuses per Q01 |
| Gaps and contradictions | approved | | Not built yet (phase 4, sessions 5–6). Gaps grouped by type with "absent from the documents" and a copyable client question; contradictions as two quotes side by side, low confidence separate; Resolve / Dismiss with a comment |
| Tasks and Linear export | todo | | Session 4 |
| Usage (AI calls with tokens and cost) | approved | built | Data from the LiteLLM spend log via `/api/usage`. Operators only (`USAGE_ADMIN_EMAILS`, fail closed; others get 403 and no nav item) until calls are tagged with a project, then scope it per project |
