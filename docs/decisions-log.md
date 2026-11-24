## LLM model

- Model: gpt-5.6-luna (GPT-6 Luna), cheapest current OpenAI model
- gpt-5-nano rejected: deprecated
- Will be configured in infra/litellm/config.yaml as alias `default-llm` (Phase 1)

## Tool versions (2026-11-15)

- Node: v24.22.1
- pnpm: 12.21.0
- uv: 0.11.16
- Docker: Docker version 29.5.2, build 79eb04c
- Supabase CLI: 3.1.0

## Git branch

- Work happens on `development`. `development` is the default branch on GitHub.
- `main` is not used.

## LiteLLM (phase 1, session 3)

- Run as proxy in Docker (`infra/docker-compose.yml`) with its own Postgres for spend logs.
- Image pinned by digest via `LITELLM_VERSION` (`main-stable@sha256:…`, LiteLLM 1.109.1).
- Alias `default-llm` → `openai/gpt-5.6-luna`; retries 1, timeout 90 s (was 60 s; raised in phase 4, see `infra/litellm/config.yaml`).
- AI service uses a virtual key (`LITELLM_VIRTUAL_KEY`), budget 5 USD / 30 days; master key stays out of app code.
- UI/API bound to 127.0.0.1:4000. Apps run locally; Docker only for infrastructure. `pnpm dev` starts everything.

## LLM client and cost (phase 1, session 4)

- Only `services/ai/app/llm/client.py` talks to an LLM, always via LiteLLM and the alias `default-llm`.
- Cost is read from the `x-litellm-response-cost` response header; it matched LiteLLM's spend log.
- `request_id` and `operation` are sent as `metadata.spend_logs_metadata` (plus a tag) so a cost can be
  traced to a request. Plain `metadata.request_id` is NOT kept by LiteLLM's spend log.
- Observed price of `gpt-5.6-luna` (derived from three calls, not read from a price list):
  about $0.20 per 1M input tokens and $1.20 per 1M output tokens. Re-check against OpenAI's pricing page.
  A ~15-token ping costs ~$0.000008.
- Typed errors: LLMTimeout 504, LLMRateLimited 429, LLMProviderError 502, LLMInvalidResponse 502.
  NestJS passes 429/502/504 through with the Python code; other upstream errors become `AI_ERROR` 502.
- `POST /api/dev/llm-ping` answers 404 unless `NODE_ENV=development`; the React route `/dev/llm`
  exists only in the Vite dev build.
