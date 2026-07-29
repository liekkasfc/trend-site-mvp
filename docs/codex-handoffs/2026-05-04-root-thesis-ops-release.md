# Codex Handoff - 2026-05-04 - Root Thesis Ops Release

## Scope / provenance

This handoff was reconstructed from the current repo state, git diff, repo docs, and saved release artifacts before archiving Codex history.

- Repo path: `<repo-root>`
- Branch: `codex/root-thesis-ops-release`
- HEAD: `4550206` (`2026-05-03 Add Hermes wiki layer and visual asset pipeline`)
- Handoff path: `docs/codex-handoffs/2026-05-04-root-thesis-ops-release.md`

## Current goal

Stabilize the single active thesis release for `automiora.com` / `ai-video-workflow-short-form-demo` after the first real production deployment, with the focus shifted from "can the pipeline publish?" to:

1. improving content competitiveness,
2. improving click/conversion presentation,
3. wiring design profiles and stronger visuals into generation,
4. keeping the commercial / follow-up backend in sync with the new flow.

In repo terms, the current work is centered on the active `AI video workflow` thesis, not on expanding to many new theses yet.

## Latest Wave 7 update

As of `2026-05-04`, this branch has now gone through three distinct Wave 7 verification modes:

1. a cached-data local verification run that proved the new design-spec-aware generation logic can pass audit / design / publish when existing stronger visuals are available, and
2. a fresh full `pipeline` run that now completes end-to-end, but only when the visual stage is forced into local fallback mode instead of waiting on slow remote image generation.
3. a follow-up full `pipeline` retry that now completes with real `apimart` visuals again after fixing the fallback-reuse short-circuit logic.

What changed in this continuation pass:

- `scripts/run-pipeline.mjs`
  - design-spec-driven copy / evidence tightening from the earlier Wave 7 work remains in place,
  - outbound fetch / AI timeouts were added,
  - a new `PIPELINE_PRESERVE_GENERATED_OUTPUTS` flag was added so future runs can preserve `public/generated-sites` and `public/generated/content-artifacts` instead of wiping them before visual reuse has a chance to work.
- `scripts/site-visuals.mjs`
  - remote image fetch / generation timeouts were added,
  - existing asset reuse was strengthened:
    - reuse by prior manifest entry,
    - reuse by matching media file on disk even if the manifest is stale or missing,
    - reuse of fallback SVGs as the last local no-network option,
  - this made the real remaining issue easier to isolate: the pipeline was deleting generated site output before the reuse logic could benefit from it.
  - a follow-up fix was then applied so `fallback.svg` assets do not permanently block regeneration when image generation is enabled.
- The full pipeline was re-run successfully with:
  - `PIPELINE_PRESERVE_GENERATED_OUTPUTS=true`
  - `SITE_IMAGE_GENERATION_ENABLED=false`
  - short content / Firecrawl timeouts
- The full pipeline was then re-run successfully again with:
  - `PIPELINE_PRESERVE_GENERATED_OUTPUTS=true`
  - `SITE_IMAGE_APIMART_RESOLUTION=1k`
  - `SITE_IMAGE_APIMART_TIMEOUT_MS=180000`
  - `SITE_IMAGE_APIMART_INITIAL_DELAY_MS=8000`
  - `SITE_IMAGE_APIMART_POLL_INTERVAL_MS=4000`
  - short content / Firecrawl timeouts

Current verified results now split into two layers:

- Cached-data local Wave 7 verification artifact:
  - `public/generated/wave7-local-verification.json`
  - result: generation / audit / design / publish all pass
  - this is still the best proof that `docs/SITE-DESIGN-SPEC.md` is truly wired into copy structure, evidence density, and gating logic
- Fresh full pipeline artifact:
  - `public/generated/pipeline-report.json`
  - latest result: `Pipeline complete: 5 approved opportunities, 1 clusters, 1 deployed sites`
  - site summary now shows `10` pages and `averageAuditScore = 100`
  - `public/generated/design-review-report.json` is back to `pass`

Current known result snapshot from the fresh full pipeline run:

- `pipeline-report.json`
  - `summary.discovered = 10`
  - `summary.approved = 5`
  - `summary.sites = 1`
  - `summary.pages = 10`
  - `summary.assets = 3`
  - `summary.averageAuditScore = 100`
- `design-review-report.json`
  - `site.status = "pass"`
  - `site.score = 100`
  - homepage gate is fully green, including `relevantHeroPreview = true`
  - `visualSystem.score = 100`
  - asset notes are now empty
- current generated media directory now contains production raster assets again, with SVG fallbacks still present alongside them:
  - `index-hero.png`
  - `workflow-hero.png`
  - `use-cases-hero.png`
  - `template-kit-hero.png`
  - `case-study-hero.png`
  - `prompt-pack-cover.png`
  - `workflow-checklist-cover.png`
  - `comparison-worksheet-cover.png`

Important nuance:

- The earlier stronger raster / generated visuals were effectively lost from the working tree when a non-preserved pipeline run wiped `public/generated-sites` before reuse. The new preserve flag is the repo-side fix for that behavior, but it does not recover the old PNG assets by itself.
- That gap is now closed: the repo now has a fresh full pipeline run that both completes and restores non-fallback visuals.
- One smaller reporting issue still remains: `public/generated/pipeline-report.json` currently shows `publishGateStatus: null` even though the latest audit / design artifacts are green.

## What is already completed

Confirmed from docs and release artifacts:

- The repo already has a working end-to-end pipeline:
  - trend -> thesis routing,
  - evidence-driven content generation,
  - 10-page cluster generation,
  - Pages + Worker + D1 + R2 release flow,
  - SEO submission,
  - GA4 / lead / delivery plumbing,
  - Hermes Wiki as the canonical content asset store.
- A real production release succeeded on `2026-05-03`.
  - Primary artifact: `storage/release-runs/latest-successful.json`
  - Matching markdown report: `storage/release-runs/2026-05-03T07-22-23-326Z-prod-ai-video-workflow-short-form-demo/report.md`
- The working tree now includes a substantial follow-up pass that appears to have:
  - introduced a formal site design spec,
  - added `config/design-profiles.json`,
  - merged design-profile data into `scripts/run-pipeline.mjs`,
  - upgraded `scripts/site-visuals.mjs` for design-aware prompting plus `apimart` support,
  - refreshed generated site pages, asset pages, and hero/cover media,
  - updated Worker follow-up / owner-email handling in `workers/automiora-api/src/index.ts`,
  - refreshed wiki claims / briefs / reviews / experiments around the AI video workflow cluster.

## Current local status

- Local checks run during this handoff:
  - `pnpm run lint` -> pass
  - `pnpm run build` -> pass
  - `pnpm run validate` -> pass
- Additional local verification from the latest Wave 7 pass:
  - syntax check for `scripts/run-pipeline.mjs` -> pass
  - syntax check for `scripts/site-visuals.mjs` -> pass
  - cached-data local regeneration / audit recompute -> pass
  - `public/generated/wave7-local-verification.json` records `audit/design/publish = pass`
  - fresh end-to-end pipeline run completed with `SITE_IMAGE_GENERATION_ENABLED=false`
  - fresh end-to-end pipeline run completed again with `apimart` visuals restored
- Working tree is dirty with a large in-flight change set.
- Generated site HTML for the active thesis exists again, and the media set now includes `.png` visuals plus SVG fallbacks.

## Files touched or investigated

### Touched in the current worktree

Docs / planning:

- `docs/CURRENT-GAPS-V2.md`
- `docs/OPERATION.md`
- `docs/SYSTEM.md`
- `docs/TODO.md`
- `docs/SITE-DESIGN-SPEC.md` (new)

Config / pipeline / visuals:

- `config/design-profiles.json` (new)
- `scripts/run-pipeline.mjs`
- `scripts/site-visuals.mjs`
- `scripts/commercial-ops.mjs`
- `storage/review-overrides.template.json`

Worker / backend:

- `workers/automiora-api/src/index.ts`

Generated site output:

- `public/generated-sites/ai-video-workflow-short-form-demo/index.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/alternatives.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/workflow.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/faq.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/best-tools.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/pricing.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/free-vs-paid.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/use-cases.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/template-kit.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/case-study.html`
- `public/generated/design-review-report.json`
- `public/generated/wave7-local-verification.json` (new)
- `public/generated-sites/ai-video-workflow-short-form-demo/audit-request.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/audit-request-thank-you.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack-thank-you.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-workflow-checklist.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-workflow-checklist-thank-you.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-comparison-worksheet.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/asset-comparison-worksheet-thank-you.html`
- `public/generated-sites/ai-video-workflow-short-form-demo/downloads/comparison-worksheet.md`
- multiple media files under `public/generated-sites/ai-video-workflow-short-form-demo/media/`
- `public/sitemap.xml`
- `public/llms.txt`

Wiki / canonical content assets:

- `wiki/02-clusters/cluster.ai-video-workflow-short-form-demo.md`
- multiple source cards under `wiki/03-sources/`
- claim cards under `wiki/04-claims/`
- page briefs under `wiki/05-page-briefs/`
- review cards under `wiki/07-reviews/`
- experiment cards under `wiki/08-experiments/`
- `wiki/README.md`

Deleted from the current worktree:

- `wiki/03-sources/source.ai-video-workflow-short-form-demo.community-reddit-com-which-video-editing-ai-tool-is--c953fa0136.md`
- `wiki/04-claims/claim.ai-video-workflow-short-form-demo.7507b7f7.md`
- `wiki/04-claims/claim.ai-video-workflow-short-form-demo.9eb3ee95.md`

Untracked items present:

- `storage/apimart-live-test/`

### Investigated while preparing this handoff

- `README.md`
- `package.json`
- `docs/CURRENT-GAPS-V2.md`
- `docs/OPERATION.md`
- `docs/SYSTEM.md`
- `docs/TODO.md`
- `docs/SITE-DESIGN-SPEC.md`
- `config/design-profiles.json`
- `storage/release-runs/latest-successful.json`
- `storage/release-runs/2026-05-03T07-22-23-326Z-prod-ai-video-workflow-short-form-demo/report.md`
- `wiki/08-experiments/experiment.ai-video-workflow-short-form-demo.*.md`
- `scripts/run-pipeline.mjs` diff
- `scripts/site-visuals.mjs` diff
- `workers/automiora-api/src/index.ts` diff

## Commands / tests already run

### Run during this handoff session

- `pwd`
- `git rev-parse --show-toplevel`
- `git branch --show-current`
- `git rev-parse --short HEAD`
- `git log -1 --pretty=format:'%h %cs %s'`
- `git status --short`
- `git diff --stat`
- `git diff --name-only`
- `git diff --name-only --diff-filter=D`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run validate`
- `CONTENT_NETWORK_TIMEOUT_MS=5000 CONTENT_AI_TIMEOUT_MS=10000 FIRECRAWL_TIMEOUT_MS=15000 SITE_IMAGE_REQUEST_TIMEOUT_MS=10000 SITE_IMAGE_SOURCE_FETCH_TIMEOUT_MS=5000 pnpm run pipeline`
  - reproduced the slow / hanging visual stage
- debug run of `scripts/.__debug-pipeline-1777883397281.mjs`
  - confirmed the stall point was `buildSiteVisualAssets`
- temporary debug run of an instrumented `site-visuals` copy
  - showed per-plan remote generation attempts were still being reached when generated outputs had been wiped
- `PIPELINE_PRESERVE_GENERATED_OUTPUTS=true SITE_IMAGE_GENERATION_ENABLED=false CONTENT_NETWORK_TIMEOUT_MS=5000 CONTENT_AI_TIMEOUT_MS=10000 FIRECRAWL_TIMEOUT_MS=15000 pnpm run pipeline`
  - completed successfully and refreshed `public/generated/pipeline-report.json`
- `PIPELINE_PRESERVE_GENERATED_OUTPUTS=true CONTENT_NETWORK_TIMEOUT_MS=5000 CONTENT_AI_TIMEOUT_MS=10000 FIRECRAWL_TIMEOUT_MS=15000 SITE_IMAGE_APIMART_RESOLUTION=1k SITE_IMAGE_REQUEST_TIMEOUT_MS=15000 SITE_IMAGE_SOURCE_FETCH_TIMEOUT_MS=5000 SITE_IMAGE_APIMART_INITIAL_DELAY_MS=8000 SITE_IMAGE_APIMART_POLL_INTERVAL_MS=4000 SITE_IMAGE_APIMART_TIMEOUT_MS=180000 pnpm run pipeline`
  - completed successfully and restored `apimart` images for all targeted page / asset visuals
- direct `apimart` task creation / poll smoke test
  - confirmed the provider was accepting jobs, but the earlier timeout window was too tight for realistic completion
- local cached-data verification script that:
  - rebuilt page models with current `scripts/run-pipeline.mjs`,
  - re-rendered the 10 core site pages,
  - recomputed audit / design review / publish gate,
  - wrote `public/generated/wave7-local-verification.json`
- multiple read-only inspections via `sed`, `cat`, `find`, and `ls`

### Previously confirmed by saved release artifacts on 2026-05-03

From `storage/release-runs/latest-successful.json`:

- `lint`
- `pipeline`
- `seo:indexnow:init`
- `build`
- `worker:r2:sync`
- `worker:d1:migrate`
- `worker:deploy`
- `pages:deploy`
- `release:health`
- `seo:diagnostics`
- `seo:submit`

Acceptance checks recorded there:

- site root GET
- asset landing GET
- ops dashboard GET
- sitemap GET
- robots GET
- `llms.txt` GET
- API health GET
- `www -> apex` redirect checks
- deliver `HEAD` + `GET`
- GA4 warmup / realtime verification attempt

## Known errors, warnings, or failing checks

### Current checkout

- No failing local checks were reproduced in this handoff.
- `lint`, `build`, and `validate` all passed locally.
- A fresh full `pnpm run pipeline` now completes both:
  - with fallback-only visuals when generation is disabled, and
  - with restored `apimart` visuals when preserved outputs + longer image polling are used.
- Remaining content notes still present in the current design review:
  - `pricing`: `1 low-evidence paragraph(s) remain.`
  - `free-vs-paid`: `2 low-evidence paragraph(s) remain.`
  - `case-study`: `1 low-evidence paragraph(s) remain.`
- `public/generated/pipeline-report.json` currently shows `publishGateStatus: null` for the site summary; this needs a small follow-up investigation to determine whether the publish-gate summary is missing, intentionally omitted, or no longer being attached to the report shape.
- The best evidence that the design-spec-aware generation logic itself passes remains:
  - `public/generated/wave7-local-verification.json` for the cached-data local proof, and
  - the latest green `public/generated/design-review-report.json` + `visual-assets.json` for the fresh full-run proof.

### Known warnings / unresolved issues from saved artifacts and wiki

- `storage/release-runs/latest-successful.json` contains a GA4 section with `status: "warning"` even though:
  - the deploy step list is otherwise all pass,
  - the warmup requests returned `204`,
  - the older markdown release report says `GA4 realtime: pass`.
- Current wiki experiments say:
  - `11 audit issue(s) remain open`
  - some pages may still be `noindex` or otherwise blocked
  - CTR is still effectively `0%`
- The latest review / experiment loop repeatedly recommends:
  - check robots / sitemap / indexable pages,
  - clear audit warnings before scaling,
  - rewrite titles, descriptions, and click-driving visuals.

Most recent experiment artifacts:

- `wiki/08-experiments/experiment.ai-video-workflow-short-form-demo.check-robots-sitemap-and-indexable-pages.md`
- `wiki/08-experiments/experiment.ai-video-workflow-short-form-demo.clear-audit-warnings-before-scaling.md`
- `wiki/08-experiments/experiment.ai-video-workflow-short-form-demo.rewrite-titles-descriptions-and-click-driving-visuals.md`

## Open decisions

1. Whether the current design-spec / design-profile / visual retry pass is now ready to commit, given that:
   - cached-data verification passes audit / design / publish,
   - a fresh full pipeline run completes,
   - and the latest full run restores non-fallback visuals.
2. Whether `PIPELINE_PRESERVE_GENERATED_OUTPUTS` should stay as an opt-in recovery / debug flag or become the default behavior whenever visual reuse is enabled.
3. Whether the `apimart` retry settings that worked here should be codified more explicitly:
   - `SITE_IMAGE_APIMART_RESOLUTION=1k`
   - longer task timeout
   - shorter initial delay / tighter poll interval
4. Whether `apimart` should remain an actively supported image provider path long term, and if so what the preferred default env setup should be versus `openai`.
5. Whether Wave 7B item `对高价值页跑一轮真实证据刷新` should now be checked off after the successful fresh source refresh, or remain open until there is a tighter manual proof that the refreshed pages contain genuinely new named objects / numbers / failure modes.
6. How to resolve the `publishGateStatus: null` result in the current `pipeline-report.json`.
7. How to resolve the GA4 reporting discrepancy:
   - is it only a realtime timing artifact,
   - or should the release acceptance logic be tightened.
8. Whether to focus the next pass on:
   - content / indexability cleanup for the current thesis,
   - conversion / visual polish,
   - or backend commercial-ops follow-up depth.
9. Whether the repo is still intentionally single-thesis-first, or ready to resume work on promoting `AI agent infrastructure` from candidate to active after this polish pass.

## Constraints, preferences, and do-not-touch areas

Repo constraints from `README.md` / docs:

- Long-lived versioned areas:
  - `config/`
  - `scripts/`
  - `src/`
  - `workers/`
  - `docs/`
  - `wiki/`
  - `public/generated-sites/`
- Do not treat these as long-lived commit targets unless intentionally needed:
  - `public/generated/*`
  - `storage/*.json`
  - `storage/*.md`
  - `storage/release-runs/*`
  - `.wrangler/`
  - `dist/`
- The repo already contains `.env`; avoid touching secrets or rewriting env files casually.
- The branch is already dirty; do not reset or discard existing worktree changes without explicit confirmation.

User / workflow preferences visible from this session:

- Preserve work with a repo-local handoff before archiving chat history.
- Prefer a handoff path under `docs/`; there was no existing dedicated handoff directory, so `docs/codex-handoffs/` was created.

Practical do-not-touch caution areas:

- Existing generated release artifacts under `storage/release-runs/` should be treated as evidence, not cleaned up blindly.
- Worker owner-email / follow-up logic in `workers/automiora-api/src/index.ts` is mid-change; avoid partial rewrites there without re-checking lead lifecycle expectations.
- Generated site HTML and wiki cards are tightly coupled to the pipeline run; avoid hand-editing large swaths unless you intentionally want to bypass regeneration.

## Next 3-7 concrete steps

1. Investigate why `public/generated/pipeline-report.json` now shows `publishGateStatus: null` even though:
   - the latest `design-review-report.json` is green,
   - the latest audit score is `100`,
   - and the earlier local verification artifact recorded `publishGate.status = "pass"`.
2. Decide whether to keep the working `apimart` retry settings as documentation, code defaults, or one-off operator guidance.
3. Do a focused manual / content review of the remaining flagged pages:
   - `pricing`
   - `free-vs-paid`
   - `case-study`
   and decide whether to tighten the low-evidence heuristics again or keep those residual notes acceptable.
4. Decide whether Wave 7B item `对高价值页跑一轮真实证据刷新` can now be checked off based on the fresh successful pipeline refresh, or whether it needs a more explicit before/after proof.
5. Re-run the release acceptance subset most relevant to this branch now that the visual state is acceptable again:
   - `pnpm run release:health`
   - `pnpm run seo:diagnostics`
   - `pnpm run release:redirect -- --paths /,/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack`
   - `pnpm run release:deliver -- --lead-id <lead-id> --delivery-token <token> --verify-get`
   - `pnpm run release:ga4 -- --site-slug ai-video-workflow-short-form-demo --asset-slug prompt-pack`
6. Leave the truly live commercial-result items honestly undone until operations produce them:
   - first real `consult request`
   - first `qualified` lead
   - first `won / paid offer / purchase` signal
7. If the new visuals/content pass looks good, stage a coherent commit that groups:
   - design spec + design profiles,
   - pipeline / site-visuals logic,
   - preserve-generated-output safeguard,
   - worker follow-up improvements,
   - regenerated site/wiki outputs,
   - Wave 7 local verification artifacts,
   - refreshed fallback/full-pipeline artifacts as appropriate.

## Reactivation prompt

Paste this into a fresh Codex chat:

```text
Continue work in <repo-root> on branch codex/root-thesis-ops-release.

Before doing anything else, read this handoff file:
<repo-root>/docs/codex-handoffs/2026-05-04-root-thesis-ops-release.md

Important context:
- The repo is in a dirty worktree with an in-flight design-profile + visual-polish + worker follow-up pass.
- Local checks already passed in this checkout: pnpm run lint, pnpm run build, pnpm run validate.
- A cached-data local Wave 7 rebuild passes audit/design/publish and is recorded in <repo-root>/public/generated/wave7-local-verification.json.
- A fresh full pipeline run now completes with restored `apimart` visuals when run with preserved outputs and slower image-task settings.
- The visual-stage root causes that were fixed in this thread were:
  - older pipeline runs wiped `public/generated-sites` and `public/generated/content-artifacts` before visual reuse could benefit from them,
  - fallback SVG reuse logic in `scripts/site-visuals.mjs` was short-circuiting regeneration when image generation was enabled.
- A GA4 discrepancy exists: latest-successful.json shows a GA4 warning even though the older markdown release report says GA4 passed.
- The current `public/generated/pipeline-report.json` shows `publishGateStatus: null`, which still needs investigation.

Your first tasks:
1. Read the handoff and inspect git status/diff.
2. Compare these three artifacts before changing anything:
   - <repo-root>/public/generated/wave7-local-verification.json
   - <repo-root>/public/generated/pipeline-report.json
   - <repo-root>/public/generated/design-review-report.json
3. Investigate why `publishGateStatus` is null in the fresh pipeline report.
4. Decide whether to codify the working `apimart` retry settings or leave them as operator overrides.
5. Keep `consult / qualified / won` items honestly undone unless you produce real live commercial signals.

Do not reset or discard existing changes unless I explicitly ask.
```
