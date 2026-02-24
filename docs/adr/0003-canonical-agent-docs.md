# ADR 0003: Canonical Agent Docs

Date: 2026-02-24
Status: Accepted

## Context
`CLAUDE.md` and `chatgpt.md` must stay identical to avoid agent drift and conflicting instructions.

## Decision
Create a single source file:
1. `docs/agent-map.source.md`

Generate targets:
1. `CLAUDE.md`
2. `chatgpt.md`

Tooling:
1. `tools/generate_agent_docs.js`
2. `tools/verify_agent_docs.js`

## Consequences
1. One edit surface for agent map updates.
2. CI can enforce sync.
3. Less manual copy/paste drift.

