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
- Alias `default-llm` → `openai/gpt-5.6-luna`; retries 2, timeout 60 s.
- AI service uses a virtual key (`LITELLM_VIRTUAL_KEY`), budget 5 USD / 30 days; master key stays out of app code.
- UI/API bound to 127.0.0.1:4000. Apps run locally; Docker only for infrastructure. `pnpm dev` starts everything.
