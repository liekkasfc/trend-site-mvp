<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The optional OpenWiki GitHub Actions workflow can refresh the repository wiki when manually dispatched. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->

## Agent engineering workflow

Use the minimum sufficient process for the task.

### Context

1. Start with `openwiki/quickstart.md`.
2. Follow only the links relevant to the current task.
3. Verify correctness-sensitive claims against current source code and tests.
4. When generated documentation conflicts with executable behavior, source and tests win.
5. Do not hand-edit generated OpenWiki pages.

### Workflow

- Trivial localized changes: make the scoped change and run focused validation.
- Clear bounded changes: use a concise plan, one implementation owner, and relevant tests.
- Bugs: reproduce first, identify the root cause, add a regression test, and make the smallest fix.
- Ambiguous, cross-module, architectural, or high-risk work: use the full Superpowers design, planning, implementation, review, and verification workflow.
- Parallelize only when shared contracts are stable and write scopes are disjoint.
- Always verify before declaring completion.

### Ownership

- Apply the default policy in `docs/agent-ownership.yaml`.
- Every writable task must declare owned paths and forbidden paths.
- Workers must ask the coordinator before changing shared or approval-required files.
- Workers must not modify `openwiki/**`, `AGENTS.md`, `CLAUDE.md`, or `.github/workflows/**`.
- Workers must not merge branches or run OpenWiki updates.
- Workers must report changed files, commits, validation commands, results, and remaining risks.

### Integration

- The integration Agent is the sole owner of branch integration and full-suite validation.
- The integration Agent is the sole local OpenWiki writer.
- After integration and validation, run OpenWiki update exactly once or leave it to the configured post-merge CI workflow.
- Use a fresh read-only Reviewer whenever the task risk justifies independent review.

### Safety

- Worktree isolation is not permission or environment isolation.
- Require confirmation for destructive actions, external writes, production changes, purchases, data deletion, and material scope expansion.
- Never place secrets in prompts, generated Wiki pages, reports, or repository configuration.

<!-- Keep this custom section outside OpenWiki's managed markers. -->
