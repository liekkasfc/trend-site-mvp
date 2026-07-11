# [Codex] Add Automiora affiliate conversion pipeline

## Summary

This PR adds the Automiora affiliate conversion pipeline on top of the existing content, wiki, QA, SEO, monitoring, Cloudflare, and lead-capture system. It does not create a separate affiliate-site architecture.

## Included

- Generic affiliate configuration, validation, feature flag handling, offer freshness checks, and commercial page eligibility.
- Fiverr offer configuration for AI video editors, short-form editors, product demo creators, scriptwriters, voice-over artists, and motion graphics providers.
- Three generated commercial pages:
  - `/guides/ai-video-diy-vs-freelancer/`
  - `/cost/ai-video-production-cost/`
  - `/hire/ai-video-editor/`
- GA4 `affiliate_click` instrumentation that keeps full affiliate URLs out of event params.
- Fiverr CSV performance reporting with latest-file default import, `--all-files` deduping, overlap replacement warnings, and no-data summaries.
- Pinterest review pack generation for real, report-backed, indexable commercial pages only.
- Commercial Ops / public summary fields with accurate affiliate metric names.
- SEO fixes for robots, canonical, sitemap eligibility, public route generation, and Gate-aware indexing.
- Release Health and `affiliate:release-check` coverage for commercial pages, disclosures, rel attributes, GA4 events, sitemap membership, placeholders, offer freshness, and test-domain safety.
- PR CI via `.github/workflows/validate.yml` using offline fixtures and test affiliate URLs.

## Validation

- `pnpm install` passed.
- `pnpm run lint` passed.
- `pnpm run test` passed: 17 tests, 0 failures.
- `AFFILIATE_FEATURE_ENABLED=false pnpm run pipeline:refresh:weekly` passed and generated 13 pages without affiliate modules.
- `AFFILIATE_FEATURE_ENABLED=false pnpm run build` passed.
- `AFFILIATE_FEATURE_ENABLED=true ... AFFILIATE_ALLOW_TEST_URLS=true pnpm run pipeline:refresh:weekly` passed and generated 13 pages with affiliate modules.
- `AFFILIATE_FEATURE_ENABLED=true ... AFFILIATE_ALLOW_TEST_URLS=true pnpm run build` passed.
- `pnpm run affiliate:report` passed with `status: no_data`.
- `pnpm run pinterest:pack` passed with 3 pages and 9 review-required pins.
- `AFFILIATE_FEATURE_ENABLED=true ... AFFILIATE_ALLOW_TEST_URLS=true pnpm run affiliate:release-check` passed: 59 checks, 0 failures.
- `AFFILIATE_FEATURE_ENABLED=true ... AFFILIATE_ALLOW_TEST_URLS=true pnpm run validate` passed.

## Manual Configuration Required

GitHub Secrets:

- `AFFILIATE_FEATURE_ENABLED`
- `FIVERR_AI_VIDEO_EDITOR_URL`
- `FIVERR_SHORT_FORM_EDITOR_URL`
- `FIVERR_PRODUCT_DEMO_VIDEO_URL`
- `FIVERR_VIDEO_SCRIPTWRITER_URL`
- `FIVERR_VOICE_OVER_URL`
- `FIVERR_MOTION_GRAPHICS_URL`

GitHub Variables:

- `AFFILIATE_OFFER_MAX_AGE_DAYS`

Cloudflare / runtime environment:

- Same affiliate feature flag and Fiverr URL variables for production generation.
- Existing `SITE_BASE_URL`, GA4, GSC, Turnstile, delivery API, and Cloudflare variables remain required by the surrounding release pipeline.

## Notes

- Test runs used `https://affiliate.example.test/...` URLs with `AFFILIATE_ALLOW_TEST_URLS=true`.
- Production release checks reject test affiliate domains unless explicitly allowed.
- No production deployment was performed.
