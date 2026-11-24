# Analysis pipeline

How a project's documents become requirements and gaps. Built so far: **requirements** and **gaps**. Contradictions come
next and reuse the same pipeline.

```
Browser ── POST /api/projects/:id/analysis ──▶ NestJS: creates analysis_runs row (queued), queues job `analysis.run`
                                               │
pg-boss worker (in the API process) ───────────┘
  AnalysisRunner.execute(runId)
    1. queued → running (atomic; a run cancelled while queued is skipped)
    2. reads the project's extracted documents and their segments
    3. POST /v1/analysis/requirements  ──▶ FastAPI ──▶ LiteLLM ──▶ OpenAI
                                          (stateless: gets segments, returns validated requirements)
    4. POST /v1/analysis/gaps          ──▶ same path; gets the segments AND the requirements just found
    5. saves both results in one transaction (advisory lock per project), run → succeeded / failed
```

## Rules

- **One active run per project.** A partial unique index on `analysis_runs(project_id)` for `queued`/`running` makes two
  simultaneous starts safe; the second answers 409 `ANALYSIS_ALREADY_RUNNING`.
- **No automatic retries.** Every attempt costs money, so a failed run is recorded (`error_code`) and the user decides to
  run it again. The AI service retries only an _invalid JSON answer_, once.
- **Statuses.** The run has its own state machine (`queued`, `running`, `succeeded`, `failed`, `cancelled`), separate
  from document statuses (Q02). A requirement is `ai_suggested`, `confirmed`, `needs_clarification` or `rejected` (Q01);
  `edited_by_user` is a separate flag. Only confirmed requirements become tasks (phase 5).
- **Re-run (Q06).** Everything a person touched is kept (edited, confirmed, needs clarification, rejected). Untouched
  AI suggestions from earlier runs are replaced. A new finding with the same title as a kept one is not added again.
  `REQ-n` numbers are never reused, even when an untouched suggestion is replaced.
- **Cancel.** The run becomes `cancelled`; a result that arrives afterwards is discarded.

## Gaps

A gap is something the documents do not say, or say too vaguely to build from. Three types: `missing_information` (a
requirement lacks a detail), `missing_requirement` (a whole topic is absent, e.g. roles), `unclear_wording`. Each has a
severity, a text and a ready **question for the client**.

- The gaps call sees all documents and the requirements as `R1, R2…` refs (`prompts/gaps/v1.md`). The AI service drops
  refs it was not given and repeated gaps. The API turns refs into REQ numbers after saving, so a gap can point at a kept
  requirement as well as a new one. A gap with no refs is shown as "Absent from the documents".
- A gap claims something is _missing_, so the documents are never split into groups: if they do not fit one call
  (60,000 tokens) the run fails with `ANALYSIS_TOO_LARGE` rather than report something "absent" that another group states.
- Nothing is saved until both steps have answered: a failed or cancelled run saves no requirements and no gaps. The run's
  `step` (requirements, gaps) drives the progress list. Cancelling during the requirements step skips the gaps call.
- Statuses `open`, `resolved`, `dismissed`, with a comment. **Re-run:** open gaps are replaced; resolved and dismissed ones
  stay with their comment; a new gap with the same text as a kept one is not added again; `G-n` numbers are never reused.
  Reopening clears the comment.
- Run totals (tokens, cost) are the sum of both calls; `prompt_version` is `requirements/v1 + gaps/v1`.

## Trust: the AI is never believed about its own citations

The model returns segment ids and a quote. The AI service checks both against the real text (`app/analysis/verify.py`):

- the quote is searched in the cited segments, then in all segments (a wrong id is repaired);
- a quote that cannot be found keeps the segment the model named but is flagged `source_unverified` (never dropped, so
  a person sees it and checks);
- matching ignores case, quote style and whitespace, tolerates an omitted middle (`start … end`) and small gaps, but not
  a different sentence; very short quotes prove nothing and stay unverified.

## Prompt injection

Documents are client-controlled text. The prompt (`services/ai/prompts/requirements/v1.md`) says that everything inside
`<document>`/`<segment>` tags is data. Tag attributes are HTML-escaped so a file name cannot close a tag, and any `<segment` or `<document` (opening or closing) inside a document's text is neutralised (`&lt;segment`), so text cannot close its own tag or open a fake one. The quote check restores those characters, so verification is unaffected. The answer
must match a strict JSON schema, ids and quotes are verified, and nothing is sent anywhere without a human confirming
it. The sample `04_vendor_notes_with_injection.txt` is analysed like any other document and produced ordinary
requirements, not "ALL REQUIREMENTS APPROVED".

## Prompts and cost

- Prompts are files with a version (`requirements/v1`); the version is stored on every run (`analysis_runs.prompt_version`).
- The static instructions come first and the documents last, so the prefix can be cached.
- Documents larger than 60,000 tokens are split into groups by segment (a segment is never cut); the groups are
  analysed one after another and identical titles are merged.
- Tokens, cost and the model are stored per run. Every call is also in LiteLLM's spend log with `operation` and
  `request_id` (see the Usage page).
- First real run, the four sample documents: 36 requirements, 0 unverified, 1,971 input and 3,343 output tokens,
  about $0.0045.

## Not built yet

Contradictions (session 6), per-run orchestration of the remaining steps, and the quality evaluation of requirements and
gaps against `samples/expected.md` (phase 4, sessions 7–8).
