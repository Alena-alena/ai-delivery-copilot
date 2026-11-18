# Analysis pipeline

How a project's documents become requirements. Built so far: **requirements**. Gaps and contradictions come next
and reuse the same pipeline.

```
Browser ── POST /api/projects/:id/analysis ──▶ NestJS: creates analysis_runs row (queued), queues job `analysis.run`
                                               │
pg-boss worker (in the API process) ───────────┘
  AnalysisRunner.execute(runId)
    1. queued → running (atomic; a run cancelled while queued is skipped)
    2. reads the project's extracted documents and their segments
    3. POST /v1/analysis/requirements  ──▶ FastAPI ──▶ LiteLLM ──▶ OpenAI
                                          (stateless: gets segments, returns validated requirements)
    4. saves the result in one transaction (advisory lock per project), run → succeeded / failed
```

## Rules

- **One active run per project.** A partial unique index on `analysis_runs(project_id)` for `queued`/`running` makes two
  simultaneous starts safe; the second answers 409 `ANALYSIS_ALREADY_RUNNING`.
- **No automatic retries.** Every attempt costs money, so a failed run is recorded (`error_code`) and the user decides to
  run it again. The AI service retries only an *invalid JSON answer*, once.
- **Statuses.** The run has its own state machine (`queued`, `running`, `succeeded`, `failed`, `cancelled`), separate
  from document statuses (Q02). A requirement is `ai_suggested`, `confirmed`, `needs_clarification` or `rejected` (Q01);
  `edited_by_user` is a separate flag. Only confirmed requirements become tasks (phase 5).
- **Re-run (Q06).** Everything a person touched is kept (edited, confirmed, needs clarification, rejected). Untouched
  AI suggestions from earlier runs are replaced. A new finding with the same title as a kept one is not added again.
  `REQ-n` numbers are never reused, even when an untouched suggestion is replaced.
- **Cancel.** The run becomes `cancelled`; a result that arrives afterwards is discarded.

## Trust: the AI is never believed about its own citations

The model returns segment ids and a quote. The AI service checks both against the real text (`app/analysis/verify.py`):

- the quote is searched in the cited segments, then in all segments (a wrong id is repaired);
- a quote that cannot be found keeps the segment the model named but is flagged `source_unverified` (never dropped, so
  a person sees it and checks);
- matching ignores case, quote style and whitespace, tolerates an omitted middle (`start … end`) and small gaps, but not
  a different sentence; very short quotes prove nothing and stay unverified.

## Prompt injection

Documents are client-controlled text. The prompt (`services/ai/prompts/requirements/v1.md`) says that everything inside
`<document>`/`<segment>` tags is data. Tag attributes are HTML-escaped so a file name cannot close a tag. The answer
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

Gaps, contradictions, the findings screens, per-run orchestration of several steps, and the quality evaluation against
`samples/expected.md` (phase 4, sessions 5–8).
