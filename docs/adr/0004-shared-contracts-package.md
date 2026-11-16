# ADR 0004: Shared Zod contracts as a built package

Status: accepted (phase 2)

## Context

The web form and the API must agree on what a valid project is. Two copies of a validation rule drift
apart: the form accepts what the API rejects, or the other way round.

## Decision

`packages/contracts` (`@copilot/contracts`) holds the Zod schemas and inferred types for request and
response bodies. Both apps depend on it through the pnpm workspace. It is **compiled to `dist/`** with
`tsc`, not imported as TypeScript source, because the API runs as compiled Node ESM and Node does not
run `.ts` files that live in `node_modules`.

## Consequences

- Build it before anything that imports it: the root scripts (`dev`, `dev-api`, `dev-web`, `lint`,
  `test`) run `pnpm contracts` first, and `pnpm -r build` orders it by dependency.
- Client-side validation is only for user experience. The API validates every request with the same
  schema (ZodValidationPipe) and never trusts the browser.
- Python (Pydantic) stays outside this package; the NestJS ↔ Python contract is OpenAPI.
