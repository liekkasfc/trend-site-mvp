# Codex Handoff - 2026-05-04 - Public Copy Gate And Release

## Scope

- Repo path: `/Users/max/code/trend-site-mvp`
- Branch: `codex/root-thesis-ops-release`
- Handoff path: `docs/codex-handoffs/2026-05-04-public-copy-gate-and-release.md`
- Prior broader handoff: `docs/codex-handoffs/2026-05-04-root-thesis-ops-release.md`

## Current goal

Make the newly found public-copy leak rules actually effective in both generation and QA, then regenerate and republish `automiora.com` so the live site stops exposing internal pipeline language, dirty source residue, and repeated keyword phrasing.

## What we completed

- Added a public-copy sanitizer and audit layer in `scripts/run-pipeline.mjs`.
- Made these issues publish-blocking at the page / site gate level:
  - internal/dev jargon on public pages
  - dirty source residue
  - adjacent duplicate keyword phrases like `workflow workflow`
- Patched public-facing template copy:
  - search / evidence phrasing
  - footer copy
  - root redirect shell copy
  - FAQ / claim wording that used internal jargon
  - workflow schema name duplication
- Sanitized public research-dossier-derived content so leaked residue no longer reappears in upgrade / proof modules.
- Fixed an accidental filename regression caused by sanitizer spacing touching `landingFileName` / `thankYouFileName` / `downloadFileName`.
- Updated docs to record the new Gate 2 public-copy hard-block rules:
  - `docs/SYSTEM.md`
  - `docs/OPERATION.md`
- Re-ran pipeline successfully with image reuse:
  - `SITE_IMAGE_GENERATION_ENABLED=false`
  - `SITE_IMAGE_REUSE_EXISTING_ASSETS=true`
- Re-ran full production release successfully enough to deploy:
  - Worker deploy passed
  - Pages deploy passed
  - `www -> apex` redirect checks passed
  - delivery `HEAD` / `GET` checks passed
- Verified live site content no longer matches the banned leak phrases on:
  - `https://automiora.com/`
  - `https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/index.html`
  - `https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/workflow.html`
  - `https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/free-vs-paid.html`

## Files touched or investigated

Core code:

- `scripts/run-pipeline.mjs`
- `scripts/site-visuals.mjs`
- `scripts/release-lib.mjs`
- `scripts/release-prod.mjs`

Docs:

- `docs/SYSTEM.md`
- `docs/OPERATION.md`
- `docs/codex-handoffs/2026-05-04-root-thesis-ops-release.md`

Generated / release artifacts investigated:

- `public/generated-sites/ai-video-workflow-short-form-demo/*.html`
- `public/generated/content-artifacts/ai-video-workflow-short-form-demo/*`
- `public/generated/pipeline-report.json`
- `dist/index.html`
- `storage/release-runs/2026-05-04T11-24-59-453Z-prod-ai-video-workflow-short-form-demo/report.json`
- `storage/release-runs/2026-05-04T11-24-59-453Z-prod-ai-video-workflow-short-form-demo/report.md`

## Commands and checks already run

- `git status --short`
- `git branch --show-current`
- `node --check scripts/run-pipeline.mjs`
- `node --check scripts/site-visuals.mjs`
- `SITE_IMAGE_GENERATION_ENABLED=false SITE_IMAGE_REUSE_EXISTING_ASSETS=true pnpm run pipeline`
- `SITE_IMAGE_GENERATION_ENABLED=false SITE_IMAGE_REUSE_EXISTING_ASSETS=true pnpm run release:prod`
- `curl -L --silent https://automiora.com/ | sed -n '1,28p'`
- `curl -L --silent https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/index.html | sed -n '390,425p'`
- `curl -L --silent https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/workflow.html | sed -n '16,24p'`
- `curl -L --silent https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/free-vs-paid.html | sed -n '852,860p'`
- `rg` scans against local generated pages and live HTML for:
  - `release-ready`
  - `pipeline dashboard`
  - `workflow workflow`
  - `As AI VIDEO technology keeps advancing`
  - `Top intents observed`
  - `commercial-style results`
  - `decision surface`
  - `workflow refs`
  - `SERP results`

## Known errors, warnings, or failing checks

Current production release finished with `overallStatus: "warning"`, not failure.

Relevant warnings:

- `seo:diagnostics`
  - `0/0 queued URLs have exact canonical coverage`
- `seo:submit`
  - `queue:blocked_gate2`
- `ga4`
  - warmup hits returned `204`, but realtime report still showed:
    - `activeUsers: 0`
    - missing events:
      - `asset_cta_click`
      - `asset_form_submit`
      - `generate_lead`
      - `asset_delivery`

Important nuance:

- The live deploy itself succeeded.
- Public copy cleanup is live.
- The remaining warnings are release-acceptance / indexing / realtime-observability warnings, not a failed Pages or Worker deploy.

Non-public raw research artifacts still contain source noise:

- `public/generated/content-artifacts/ai-video-workflow-short-form-demo/source-pack.json`

This is currently raw research input, not visitor-facing page copy. If desired later, we can also sanitize exported research snapshots.

## Open decisions

- Whether raw exported research artifacts under `public/generated/content-artifacts/*` should also be sanitized for external cleanliness, or remain raw for operator traceability.
- Whether to treat current `blocked_gate2` SEO submission as acceptable for now, or keep pushing until the site is fully indexable again.
- Whether to do a true browser-path GA4 realtime acceptance run instead of relying on backend smoke + measurement protocol warmup.

## Constraints, user preferences, and do-not-touch areas

- User preference: public site copy must read high-quality and must not leak internal/dev/pipeline jargon.
- User preference: fix this in generation and QA, not by hand-editing generated HTML as the primary solution.
- Working tree is dirty; do not reset or revert unrelated changes.
- Use `apply_patch` for file edits.
- Production Pages deploy uses explicit production branch targeting:
  - `CLOUDFLARE_PAGES_BRANCH`
  - current release report shows branch `main`
- Reuse existing image assets when possible; full remote regeneration can stall.

## Next 3-7 concrete steps

1. Decide whether to sanitize `source-pack.json` and other exported research snapshots, or intentionally keep them raw.
2. Inspect why current publish/indexing state still leaves `seo:submit` at `queue:blocked_gate2` even though the public-copy gate is now clean.
3. Run a real browser-path conversion on the live asset page and then re-run `pnpm run release:ga4` to get stronger GA4 realtime evidence.
4. Review current `sitemap.xml`, `robots.txt`, and page `noindex` status to understand the remaining Gate 2 / indexing blocker.
5. If the user wants full green release acceptance, patch the remaining Gate 2 blockers and rerun `SITE_IMAGE_GENERATION_ENABLED=false SITE_IMAGE_REUSE_EXISTING_ASSETS=true pnpm run release:prod`.

## Reactivation prompt

Paste this into a fresh Codex chat:

```text
Continue work on /Users/max/code/trend-site-mvp on branch codex/root-thesis-ops-release.

Read these handoffs first:
- /Users/max/code/trend-site-mvp/docs/codex-handoffs/2026-05-04-root-thesis-ops-release.md
- /Users/max/code/trend-site-mvp/docs/codex-handoffs/2026-05-04-public-copy-gate-and-release.md

Current state:
- Public-copy leak rules were added to generation and QA in scripts/run-pipeline.mjs.
- Live automiora.com has already been re-released after these fixes.
- Live public pages no longer expose the banned phrases:
  - release-ready
  - pipeline dashboard
  - workflow workflow
  - the leaked “As AI VIDEO technology keeps advancing...” source residue
- scripts/site-visuals.mjs was also patched so alt text no longer repeats keywords awkwardly.
- A sanitizer regression that created filenames like "asset-prompt-pack. html" was fixed by exempting landingFileName / thankYouFileName / downloadFileName from public-copy spacing cleanup.

Most recent important command results:
- SITE_IMAGE_GENERATION_ENABLED=false SITE_IMAGE_REUSE_EXISTING_ASSETS=true pnpm run pipeline -> pass
- SITE_IMAGE_GENERATION_ENABLED=false SITE_IMAGE_REUSE_EXISTING_ASSETS=true pnpm run release:prod -> deployed successfully, but overallStatus stayed warning

Most recent release artifact:
- /Users/max/code/trend-site-mvp/storage/release-runs/2026-05-04T11-24-59-453Z-prod-ai-video-workflow-short-form-demo/report.json
- /Users/max/code/trend-site-mvp/storage/release-runs/2026-05-04T11-24-59-453Z-prod-ai-video-workflow-short-form-demo/report.md

Open issues to continue from:
- release report still shows seo:submit warning with queue:blocked_gate2
- GA4 realtime acceptance is still warning-level
- raw research snapshot public/generated/content-artifacts/ai-video-workflow-short-form-demo/source-pack.json still contains unsanitized source residue and internal research phrasing

Please inspect the current generated outputs and release report, explain the remaining Gate 2 / indexing blocker, and then either:
1. fix the remaining blocker and rerun release:prod, or
2. clearly document why we should intentionally stop here.
```
