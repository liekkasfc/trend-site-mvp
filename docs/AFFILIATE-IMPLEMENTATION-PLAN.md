# Affiliate Implementation Plan

Generated: 2026-07-11

## 1. Current Page Generation Flow

The repository already has a single content pipeline in `scripts/run-pipeline.mjs`. It reads:

- `config/experiment.json`
- `config/thesis-registry.json`
- `config/routing-rules.json`
- `config/tool-catalog.json`
- optional wiki cards under `wiki/`
- optional generated monitoring and commercial snapshots under `storage/`

The main flow is:

1. Discover and route topics into the active thesis.
2. Build research and source packs.
3. Extract facts, claims, page briefs, rankings, assets, and offers.
4. Generate page models in `buildPageModels()`.
5. Render HTML with `renderSiteHtml()`, `renderPublicHomeHtml()`, asset landing pages, and consult pages.
6. Run page audit in `auditPage()` and summarize with `buildSiteSummary()`.
7. Evaluate Gate 2 in `evaluatePublishGate()`.
8. Write generated site files under `public/generated-sites/` and release public routes under `public/`.
9. Write reports under `public/generated/`, `storage/`, and `wiki/`.

## 2. CTA Generation Location

CTA data is already part of page models:

- `ctaTitle`
- `ctaButtonLabel`
- `ctaCopy`
- `ctaHref`
- `ctaEvent`
- `secondaryCtaTitle`
- `secondaryCtaButtonLabel`
- `secondaryCtaCopy`

Primary CTA rendering happens near the bottom of `renderSiteHtml()`. Higher-intent action blocks are built by `buildCommercialModules()` and rendered by `renderCommercialModules()`.

Affiliate CTA should be added to this same commercial module layer, not hard-coded into prose or standalone HTML.

## 3. Page Model Structure

The frontend dashboard model in `src/App.tsx` already includes:

- `ctaHref`
- `ctaEvent`
- `commercialModuleCount`
- `sourceReferenceCount`
- `reviewSignals`
- `contentStats`

The pipeline page model already carries richer internal fields:

- `commercialModules`
- `materialSlots`
- `pageBrief`
- `claimIds`
- `sourceReferences`
- `sectionProvenance`
- `assetBinding`

Affiliate should extend page models with optional fields:

- `affiliateModules`
- `affiliateDisclosureRequired`
- `commercialIntentScore`

Existing fields must stay intact.

## 4. Quality Gate Location

Gate 2 is centered in:

- `auditPage(renderedPage)`
- `buildSiteSummary(cluster, renderedPages)`
- `evaluatePublishGate(site)`
- `buildReviewQueue(sites)`

New affiliate checks should be added to `auditPage()` and reflected in page `reviewSignals`, so failures appear in the existing review queue.

## 5. GA4 Event Location

GA4 is injected in `renderGa4Snippet(page, options)`.

Current click tracking scans `[data-ga4-event]` and sends:

- `page_path`
- `page_title`
- `event_label`
- `cta_title`

Affiliate click tracking should reuse this mechanism but add sanitized `data-affiliate-*` attributes. It must not send the full affiliate URL to GA4.

## 6. Commercial Ops Data Structure

`scripts/commercial-ops.mjs` currently reads D1 lead and consult tables and writes:

- `storage/commercial-ops.json`
- `storage/commercial-ops.md`
- run-scoped copies under `storage/release-runs/`

Pipeline also builds:

- `buildCommercialIntentModel()`
- `buildAssetPerformanceView()`
- `buildPhase2ExpansionTrigger()`
- `buildContentFeedback()`

Affiliate performance should enter as a separate summary read from `storage/affiliate-performance.json`, then be merged into commercial ops and pipeline reports without treating registrations as revenue.

## 7. Files To Modify

- `.env.example`
- `package.json`
- `config/experiment.json`
- `scripts/run-pipeline.mjs`
- `scripts/commercial-ops.mjs`
- `scripts/refresh-live-monitoring.mjs`
- `src/App.tsx`

## 8. Files To Add

- `config/affiliate-programs.json`
- `config/affiliate-offers.json`
- `config/affiliate-thresholds.json`
- `scripts/import-fiverr-report.mjs`
- `scripts/build-affiliate-report.mjs`
- `scripts/affiliate-lib.mjs`
- `test/affiliate.test.mjs`
- anonymous CSV fixture files under `test/fixtures/`

## 9. Compatibility Risks

- `AFFILIATE_FEATURE_ENABLED=false` must preserve current behavior.
- Public canonical URLs for `/`, `/workflow/`, `/compare/`, `/prompt-pack/`, and `/audit/` must not change.
- Existing GA4 lead, asset, and consult events must continue to fire.
- Affiliate links must not be embedded directly in templates or article copy.
- Fiverr private affiliate URLs must only come from environment variables.
- Gate 2 may become stricter; feature flag handling should avoid blocking existing pages when affiliate is disabled.
- Existing dirty generated files in the worktree should not be reverted.

## 10. Phased Implementation

Phase 1:

1. Add affiliate program/offer config with Fiverr as the first program.
2. Add feature flag and env placeholders.
3. Add reusable affiliate parsing, eligibility, freshness, and GA4 payload helpers.
4. Add the first three commercial page types:
   - `/guides/ai-video-diy-vs-freelancer/`
   - `/cost/ai-video-production-cost/`
   - `/hire/ai-video-editor/`
5. Render affiliate disclosure, decision path, service cards, and affiliate CTA modules only on eligible commercial pages.
6. Add `affiliate_click` GA4 tracking without full destination URLs.
7. Add Gate 2 affiliate audit checks.
8. Add Fiverr CSV import/report scripts with `no_data` behavior.
9. Feed affiliate summary into commercial ops and pipeline reports.
10. Add focused Node tests.

Later phases:

1. Expand commercial pages based on real GSC, GA4, and affiliate data.
2. Generate Pinterest review packs.
3. Add more affiliate programs.
4. Tighten automated expansion decisions after enough click and FTB sample size exists.
