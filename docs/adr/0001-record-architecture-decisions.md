# 1. Record architecture decisions

Date: 2026-10-01

## Status

Accepted

## Context

Architecture decisions for ResumePreps have so far been recorded in long
strategy and status documents (now in `docs/archive/`) and in commit messages.
Those mix decisions with progress reports. It is hard to find why something
was done, what was rejected, and whether a decision still holds. With remote
agents opening many PRs, a decision that is not written down gets re-litigated
or silently reversed.

## Decision

We record each architecturally significant decision as an Architecture Decision
Record (ADR), following Michael Nygard's format
(https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

- One Markdown file per decision in `docs/adr/`, named
  `NNNN-short-title.md` with a zero-padded, never-reused sequence number.
- Sections: **Title**, **Date**, **Status** (`proposed`, `accepted`,
  `rejected`, `deprecated`, or `superseded by NNNN`), **Context**,
  **Decision**, **Consequences**.
- ADRs are immutable once accepted. To change a decision, write a new ADR
  that supersedes the old one and update only the old one's Status line.
- An ADR is proposed in the same PR as the first change that depends on it,
  or on its own PR when the decision comes first.
- "Architecturally significant" means: where code runs, how components talk,
  data model and ownership, external vendors, security boundaries, and
  anything costly to reverse.

## Consequences

- `docs/architecture.md` stays a short current-state map and links to ADRs
  for the reasoning.
- Reviewers can ask "which ADR covers this?" for structural PRs.
- There is a small writing cost per decision; trivial or easily reversed
  choices do not need an ADR.
