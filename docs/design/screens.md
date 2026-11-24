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
| Project page with tabs | prototyped | built | Tasks and Settings tabs are placeholders in the app (designed in the prototype); Edit/Delete are in the header |
| Documents tab (upload, statuses, failed, duplicate notice) | prototyped | built | |
| Delete document dialog | prototyped | built | |
| View text dialog | prototyped | built | Fixed header, scrolling content |
| Status page | todo | built (restyled by the theme only) | Not designed |
| AI analysis: run, progress, failed | approved | built (requirements step) | Run confirmation with estimate, progress, cancel, re-run keeps edited and confirmed items. A failed run saves nothing and earlier results stay. Requirements and gaps steps exist; contradictions come next |
| Requirements table and detail panel | approved | built | Filters by status, bulk confirm, side panel with the verified quote, Confirm / Needs clarification / Reject / Edit. Statuses per Q01 |
| Gaps | approved | built | Grouped by type, severity, REQ chips or "Absent from the documents", copyable client question, Copy all open questions, Resolve / Dismiss with a comment, Reopen. Progress shows the Requirements and Gaps steps |
| Contradictions | approved | | Not built yet (phase 4, session 6). Two quotes side by side, low confidence separate; Resolve / Dismiss with a comment |
| Tasks: generate from confirmed requirements | approved | | Pick confirmed requirements (open gaps shown and passed to the AI), estimate, progress with cancel. No confirmed requirements → empty state that links to Analysis |
| Tasks: review list and side panel | approved | | Grouped by requirement; filters by status; bulk approve / reject; side panel edits title, description, priority and acceptance criteria (add / remove, at least one). Statuses: Draft, Approved, Rejected, Sending, In Linear, Send failed. A task whose requirement changed after approval goes back to Draft with "Requirement changed". Sent tasks are read-only with the Linear link. Sticky "N ready to send" bar |
| Send to Linear: confirmation, progress, partial failure | approved | | Dialog names the count, team, project and label, and says issues stay in Linear. Double click sends once. Result banner "N created, M failed" with Retry failed only; the error per task is shown in its row. Not connected → dialog that links to Settings |
| Settings tab: Linear connection | approved | | Status Connected / Not connected / Key rejected (key from the server env, never shown). Team, optional project, "copilot" label, priority mapping to Linear 0–4 (Q21). Assignee and status are left to Linear |
| Usage (AI calls with tokens and cost) | approved | built | Data from the LiteLLM spend log via `/api/usage`. Operators only (`USAGE_ADMIN_EMAILS`, fail closed; others get 403 and no nav item) until calls are tagged with a project, then scope it per project |
