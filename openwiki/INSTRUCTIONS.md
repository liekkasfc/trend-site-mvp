# Repository Wiki Instructions

## Purpose

Maintain a concise, source-grounded Wiki that helps coding Agents understand
this repository without scanning the entire codebase.

## Priorities

Prioritize documentation for:

1. The evidence-driven content pipeline and thesis-routing boundaries.
2. Route manifests, page contracts, release gates, and generated output.
3. Worker APIs, D1/R2 persistence, schemas, migrations, and consistency rules.
4. Build, test, deployment, rollback, monitoring, and incident procedures.
5. External integrations, authentication, authorization, and permission boundaries.
6. Extension points, invariants, common failure modes, and known gotchas.
7. Source maps that point Agents to authoritative implementation and tests.

## Exclusions

Do not spend significant documentation effort on:

- `node_modules/`, `.pnpm-store/`, `dist/`, `.wrangler/`, or other generated caches.
- Generated public-site artifacts when their source configuration or generator is authoritative.
- Lockfile internals.
- Temporary scripts, experiments, and local-only files.
- Secrets, tokens, credentials, private URLs, or real customer data.

Treat `wiki/` as the Hermes content/evidence store and `openwiki/` as generated
repository documentation. Do not merge their responsibilities.

## Source-of-truth order

1. Tests and executable behavior.
2. Current source code, migrations, schemas, manifests, and configuration.
3. Accepted ADRs and manually maintained specifications.
4. Existing generated OpenWiki pages.

When sources conflict, describe current executable behavior and flag the stale
source for human review.

## Writing style

- Be concise and operational.
- Explain why boundaries and invariants exist.
- Link to source files and tests instead of reproducing large code blocks.
- Use diagrams only when they clarify a real relationship or sequence.
- State uncertainty explicitly.
- Do not invent intent unsupported by code, tests, ADRs, or specifications.

## Update policy

Refresh the Wiki after meaningful changes to architecture, APIs, schemas,
permissions, integrations, deployment, testing, or major workflows.

Do not rewrite this `INSTRUCTIONS.md` during normal generated Wiki updates.
