---
name: phase-quiz
description: Self-check quiz at the end of a roadmap phase. Use when the user finishes a phase (or says "quiz me", "self check", "test my understanding") for the Delivery Copilot project. Writes code-grounded questions with reference answers onto the roadmap site, then grades her written answers and logs weak spots.
argument-hint: '[phase number, e.g. 1]'
---

# Phase quiz

The user is learning while building this project. The goal is to check that they understand what was
built, not to recite documentation. Phase = `$ARGUMENTS` (if empty, use the most recently finished phase).

## 1. Gather material (do this silently, then start)

- Roadmap artifact: https://claude.ai/artifact/7x2Uv2SkSpEDijn27vCkxq. Read it with the Artifact tool
  and take that phase's "Ключевые концепции фазы" and every session's "Learning check" questions.
- Her earlier notes: `ArtifactData` list collection `quiz` (ids look like `p1s2c1`). Skip questions she
  already marked `known`; revisit ones with weak or empty notes.
- The real code: `git log --oneline` and `git diff` for the phase's commits, plus `docs/adr/`,
  `docs/decisions-log.md`, and `docs/learning-log.md` (earlier weak spots).

## 2. Write 5-7 questions

Mix these kinds, at most two of each:

1. **Why** - a decision in this repo ("why does the API return 404, not 403, for another user's project?").
2. **Read the code** - point at a real file and lines; ask what it does or what breaks if a line is removed.
3. **What if** - a failure scenario ("LiteLLM is down", "token is forged", "user double-clicks Send").
4. **Predict** - what a command or request returns, before she runs it.
5. **Trade-off** - why this option and not the alternative from the Questions list (Q11-Q29).

Questions must be answerable from what she built or read. Include at least two from the roadmap's own
Learning checks. Never ask trivia (version numbers, flag names) she would just look up.

## 3. Put the questions on the site, never quiz in chat

The user wants questions and reference answers on the roadmap site, not in the conversation. Do **not** ask
the questions in chat.

- The site is bilingual (an EN | RU switcher in the header). The page source has two data blocks, `EN` and
  `RU`, with the same structure: every question must be added to **both**, with the same id order, or the two
  languages drift apart.
- In each block add the phase's questions to `PHASES[<phase>].quiz` as `{g, q, a}` (topic, question,
  reference answer). In the RU block the phase quizzes and session answers are attached after the main array
  from `RU_EXTRA` (`RU_EXTRA.quiz[<phase>]`, `RU_EXTRA.answers[<sessionId>]`), so add Russian text there.
  They render in the Self-check section as "Phase check" cards with ids `p<N>z<i>`; the user writes her answer
  in the box and opens the reference answer to compare.
- Every question needs a detailed answer, added to the `DETAIL` object in the page source by question id
  (`DETAIL.en.p4z1`, `DETAIL.ru.p4z1`; it overrides the short `a` text). Use four labelled parts separated by blank
  lines, with `**bold**` labels: **In short** (the answer in one sentence), **Why** (the mechanism or reason),
  **In this project** (the concrete file, setting or test where it shows up; for planned phases say "(planned)"),
  **Without it** (what goes wrong otherwise). About 70-110 words, tied to real code, no invented facts.
- Every question also needs a plain-language answer: add it to the `SIMPLE` object in the page source, keyed by the
  question id (`SIMPLE.en.p4z1`, `SIMPLE.ru.p4z1`). One or two sentences, no jargon, with an everyday comparison
  where it helps. The page shows it above the detailed answer as "In simple words".
- Read the artifact with the Artifact tool, edit the saved file, publish to the same URL. Check both languages
  render (switch EN/RU) and that the question counts match before publishing.
- Do not add questions that already exist (ids in the `quiz` db collection and the current QUIZ list).

## 4. After she has answered on the site

When she says she has answered (or asks "check my answers"): read her notes from the `quiz` collection with
`ArtifactData`, compare each with the reference answer, and reply in chat with right / partly / not yet per
question plus 1-2 sentences of feedback. Then:

- Append date, phase, score, weak topics to `docs/learning-log.md` (create if missing). Commit nothing.
- Offer to tick "Got it" for the ones she mastered (`quiz/<id>` set to `{note, known: true, at: <ms>}`);
  do it only after she says yes. Offer to revisit weak topics in the next phase's first session.
