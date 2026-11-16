# ADR 0002: Workspace from day one

Status: accepted (phase 2)

## Context

The MVP has one user per account. Teams, invitations and several people on one project are explicitly out
of scope. But a project that points straight at a user (`projects.user_id`) is expensive to change: every
query, ownership check and index assumes it.

## Decision

Every user gets a personal workspace. Projects belong to a workspace, and access is decided by a row in
`workspace_members` (`role = owner` for now).

## Consequences

- Slightly more joins and one extra transaction on first login (profile, workspace and membership together).
- Teams, invitations and roles later add rows and enum values instead of reshaping `projects`.
- Every access check goes through one place (`ProjectAccessService`), so there is a single rule to change.
