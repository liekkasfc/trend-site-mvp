---
type: Operations Guide
title: Release Gates and Validation
description: Documents the checks that determine whether generated site output can be published, including canonical publish status, thesis alignment and uniqueness, homepage composition, affiliate mode, route contracts, and CI diagnostics.
tags: [operations, release, validation, quality]
resource: file:///Users/max/code/trend-site-mvp/scripts/publish-gate.mjs
---

# Release gates and validation

Publication is allowed only when the generated site satisfies the repository's quality and contract checks. The canonical aggregation lives in `scripts/publish-gate.mjs`; release tooling can consume the scalar `publishGateStatus` and the structured `publishGate` summary from `public/generated/pipeline-report.json`.

## Canonical publish status

Statuses normalize to `pass`, `fail`, `warning`, or `skipped`. A production publish is allowed only for `pass`. Across multiple sites, aggregation uses the precedence `fail > warning > skipped > pass`; an empty site list is `skipped`. The structured summary also reports blocked pages, reasons, the site slug, and its report source.

A gate can identify homepage composition violations, thesis-alignment-blocked paths, or unconsumed review backlog items. Review overrides are represented by the non-secret `storage/review-overrides.json` runtime file, based on `storage/review-overrides.template.json`; changes to approved copy, verdicts, facts, or review notes should still pass the generated-output and thesis checks. This gives release and deployment tooling one stable decision boundary instead of requiring each consumer to reconstruct page-level failures.

## Thesis and homepage checks

`scripts/thesis-alignment-gate.mjs` evaluates page audience, inputs, outcomes, context, proof, verdict, CTA, forbidden positioning, and substantive-content uniqueness. Boilerplate, navigation, footer, disclosures, and conversion modules are excluded from duplicate analysis. Uniqueness contributes 10 points at or below 10% duplicate content, 5 points above 10% through 20%, and zero above 20%; severe in-page duplication fails the page. Short pages use additional minimum-evidence rules to avoid false duplicate failures.

`scripts/homepage-composition-gate.mjs` checks the homepage's proof composition and rejects fallback SVG hero visuals. The generated homepage is expected to use the curated production visual asset and satisfy responsive/runtime composition contracts.

The [pipeline and routing architecture](../architecture/pipeline-and-routing.md) explains how these gates receive manifest-derived page and route context.

## Validation command and CI

`pnpm run validate` runs lint, build, homepage and thesis gates, tests, affiliate release checks, and syntax checks for the main pipeline, routing, release, SEO, worker, and content scripts. GitHub Actions runs the pipeline with offline fixtures before validation and uploads diagnostics—including the pipeline, review queue, affiliate, homepage, thesis, Pinterest, sitemap, and affiliate-performance reports—when validation fails. The repository also has an optional manual [OpenWiki update workflow](../../.github/workflows/openwiki-update.yml) that runs `openwiki code --update --print` and opens a scoped documentation pull request; it is separate from the production publish gate.

Focused checks include:

- `test/route-manifest.test.mjs` — route uniqueness, CTA validity, indexability, monitoring, analytics, and blocked prefixes.
- `test/production-route-assets.test.mjs` — production canonicals, generated-site isolation, sitemap, and robots consistency.
- `test/release-prod-contract.test.mjs` — publish gating, deployment branch selection, health retries, GA4 states, and reporting.
- `test/thesis-alignment-gate.test.mjs` — evidence-backed thesis alignment and uniqueness scoring.
- `test/homepage-runtime-contract.test.mjs` and `test/homepage-composition-gate.test.mjs` — responsive runtime and visual proof requirements.
- `test/affiliate-static-e2e.test.mjs` — affiliate disclosure/link behavior in enabled and disabled modes.

Affiliate behavior is feature-flagged: when `AFFILIATE_FEATURE_ENABLED=true`, commercial output must include the configured disclosures, attributes, and analytics; when disabled, generated commercial pages must not contain affiliate anchors or disclosures.

## Change guidance

When a release check changes, update the responsible script and its contract test together. Inspect `public/generated/pipeline-report.json` and the uploaded diagnostics before retrying a blocked release. Do not bypass a failed publish gate by publishing a generated page directly; fix the underlying route, thesis, homepage, evidence, affiliate, or runtime contract first.
