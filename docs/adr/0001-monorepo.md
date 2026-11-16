# ADR 0001: pnpm monorepo

Status: accepted (2026-11-16)

## Context

The project has two TypeScript apps (web, api), a shared contracts package, a Python AI service and
infrastructure config. Contracts, docker-compose and docs must change together with the code.

## Decision

One repository with pnpm workspaces (`apps/*`, `packages/*`). The Python service lives in
`services/ai` (managed by uv, outside the pnpm workspace) because it is an internal service with no
public access. Turborepo / Nx are not used: two TS apps and one shared package do not need them yet.

## Consequences

- One commit can change a contract, both sides of it and the docs.
- Python tooling is independent of pnpm; root scripts orchestrate both.
- Tooling note: the Vite and Nest templates ship with oxlint (not ESLint) and Vitest (not Jest);
  we keep them instead of replacing with the plan's ESLint.
