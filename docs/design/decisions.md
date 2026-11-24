# Design decisions

What the approved prototype decided, written down so the next phases build against rules rather than screenshots.
Look: `principles.md` and `tokens.md`. Status of each screen: `screens.md`. Clickable reference: `prototype/`
(throwaway code, never imported by the app).

Approved by the user in writing on 2026-11-25 (phase 3.5, session 5), after a walkthrough of the prototype
(every screen and state, light and dark, desktop and phone width) and of the real app.

## The flow

Sign in → Projects → Project page with four tabs: **Documents → Analysis → Tasks → Settings**. Each tab is a step in
the work, left to right, and each can be used on its own. Two pages sit outside a project: **Usage** (operators only)
and **Status**.

## Rules for every screen

1. **Four states, always.** Full, loading (skeletons shaped like the content, not spinners), empty (says why it is
   empty and the one next action), error (says what failed, offers Try again). A failure of one part never blanks the
   page.
2. **AI output is visibly AI.** A suggestion carries an "AI suggestion" badge until a person confirms it. Edited items
   carry "Edited". A quote that could not be matched in the document carries "Unverified source" and is never styled
   as verified.
3. **Evidence next to the claim.** Every requirement, gap and contradiction shows its quote, the document and page,
   and a way to open the document text.
4. **Confirm before destructive or outward actions.** The dialog names exactly what happens (how many, where to) and
   whether it can be undone. Delete project, delete document, cancel a run, and send to Linear all confirm.
5. **Long work runs in the background.** Extraction, analysis and task generation show progress, can be left (the
   result appears when ready) and can be cancelled. A failed run saves nothing; earlier results stay.
6. **Human decisions survive re-runs.** Running the analysis or task generation again replaces only untouched AI
   output. Edited, confirmed, approved, resolved, dismissed and sent items are kept.
7. **Toasts confirm what just happened**, in a few words ("3 confirmed", "Question copied"). Errors that need a decision
   stay on the screen, not in a toast.
8. **Status colours are reserved:** green done, amber in progress or needs attention, red failed or destructive.
   The terracotta accent marks only the primary action, the current place and links.
9. **One date format:** dates as "24 Nov 2026", date and time as "24 Nov 2026, 15:26" (24-hour), whatever the
   browser locale. In the app they go through `apps/web/src/lib/format.ts`.
10. **Light, dark and phone width** all work. On a phone, secondary table columns hide; nothing scrolls sideways except
    a filter row.

## Screens

### Sign in and shell

- Email and password only (sign-up, sign-in, sign-out; password reset is after the MVP).
- Header: brand, Projects, Usage (operators only), Status, the user's email, Sign out, theme toggle. The theme follows
  the system until the toggle is used.

### Projects

- Cards with name, description and last update. New / Edit in one dialog; Delete confirms and says it cannot be
  undone. Empty state invites creating the first project.

### Documents tab

- Drop zone (PDF, DOCX, TXT, up to 10 MB). Table with name, status (Queued, Extracting text…, Ready, Failed), size and
  token count. A failed document shows the reason in plain words under its name; Retry appears only when the
  cause is temporary (a scan with no text layer cannot be fixed by retrying).
- A duplicate upload is refused with a notice naming the existing file.
- View text opens the extracted segments with page numbers (fixed header, scrolling body).

### Analysis tab

- **Before a run:** what is included and what is left out (and why), with a token, cost and time estimate. The run
  confirms first; a re-run says that edits and confirmations are kept.
- **During:** steps (Requirements → Gaps → Contradictions) with progress; Cancel confirms.
- **Failed:** which step stopped and why, "nothing from this run was saved", Try again, and the earlier results.
- **Results:** a summary line (run number, time, cost, Run again) and three sub-tabs with counts and how many need
  attention.
- **Requirements:** table with status filters and bulk confirm; a side panel with the quote, source, AI note and
  Confirm / Needs clarification / Reject / Edit. Statuses: AI suggestion, Confirmed, Needs clarification, Rejected
  (Q01). The source quote cannot be edited. Only confirmed requirements become tasks.
- **Gaps:** grouped by type (missing information, missing requirement, unclear wording), with severity, REQ links or
  "Absent from the documents", and a ready question for the client (Copy, Copy all open questions). Resolve or Dismiss
  with an optional comment; Reopen.
- **Contradictions:** two quotes side by side, why they conflict, and a clarification to ask. Shown as _possible_
  contradictions; low-confidence ones are listed separately so they do not hide the likely ones.

### Tasks tab

- **Generate:** only confirmed requirements can be picked; open gaps on them are shown and given to the AI. Estimate,
  progress, Cancel. With nothing confirmed, the empty state sends the user to Analysis.
- **Review:** tasks grouped by requirement, status filters, bulk Approve / Reject. The side panel edits title,
  description, priority and acceptance criteria (add and remove; at least one is required to save or approve).
- **Task statuses:** Draft, Approved, Rejected, Sending, In Linear, Send failed.
- **Changed requirement:** if a requirement is edited after its task was approved, the task returns to Draft with
  "Requirement changed" and must be approved again. Nothing is sent on an approval given to old text.
- **Send to Linear:** a sticky bar counts approved tasks. The confirmation names the count, team, project and label,
  and says issues stay in Linear. A double click sends once. Partial failure shows "N created, M failed" with Retry
  failed only, and each failed task shows its error. Sent tasks are read-only and link to the Linear issue.

### Settings tab

- Linear connection: Connected / Not connected / Key rejected. The API key lives in the server environment and is
  never shown or entered in the browser.
- Team (once per project), optional project, a `copilot` label on every issue, priority mapping to Linear 0–4 (Q21).
  Assignee and status are left to Linear. Changing settings does not touch issues already created.
- Without a connection, tasks can still be generated and approved, but not sent.

### Usage (operators only)

- Spend against the budget, number of calls and tokens; filters by period and operation; one row per AI call with
  tokens, cost, latency and request id. Prompts and answers are not stored.

## Open points

- **Status page** is not designed; it keeps the default look until it is.
- **Sign-up form** is not in the prototype (same card as sign-in with one more field).
- **Contradictions** are approved but not built (phase 4, session 6). Until then the gaps step may file conflicts
  under "unclear wording".
- **Tasks and Settings** are approved but not built (phase 5).
- **Document count** on project cards waits for the API to return it.
- **Usage per project** waits for AI calls to be tagged with a project; until then the page is operators only.
- **Linear OAuth** is after the MVP; the connection model already allows it (`auth_type`).
