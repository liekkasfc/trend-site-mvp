---
type: Architecture Guide
title: Pipeline and Production Routing
description: Explains how the content pipeline loads thesis and page contracts, generates site artifacts, and uses a centralized route manifest to define production URLs, CTAs, indexability, monitoring, analytics, and excluded paths.
tags: [architecture, pipeline, routing, configuration]
resource: file:///Users/max/code/trend-site-mvp/scripts/run-pipeline.mjs
---

# Pipeline and production routing

The pipeline is orchestrated by `scripts/run-pipeline.mjs`. It loads environment settings and the configuration registries, then resolves page-intent contracts against the route manifest before generating content artifacts, pages, visual assets, diagnostics, and publication metadata. This makes the pipeline an evidence-to-publication boundary rather than just a static page builder.

## Configuration flow

The pipeline loads `config/experiment.json` for the active thesis/run limits, `config/thesis-registry.json` for thesis definitions, `config/design-profiles.json` for presentation rules, `config/page-intents.json` for page-specific contracts, and `config/route-manifest.json` for production routing. Page intents are resolved against the manifest, so a page contract cannot silently point at an unregistered or conflicting production path.

The [route manifest](../../config/route-manifest.json) defines the production route set for `https://automiora.com`. Each route records its kind, indexability, monitoring and analytics participation, intent, page types, and—where applicable—CTA, asset, or offer targets. The manifest also excludes `/generated-sites/`, `/ops/`, and `/downloads/` from the production route boundary.

## Why the manifest matters

The manifest is the shared contract for generation and publication. Route helpers in `scripts/route-manifest.mjs` provide filtered views for indexable paths, monitored paths, analytics paths, asset and offer paths, page-type lookup, and excluded prefixes. This keeps generated pages, sitemap/robots behavior, monitoring, analytics, and CTA validation aligned instead of maintaining separate hard-coded maps.

Production route validation fails fast for duplicate paths, invalid canonical paths, unknown CTA targets, and contradictory page-intent contracts. When changing a page or adding a route, update the manifest and its matching page-intent contract together, then run the route and production-asset tests through `pnpm run validate`.

## Generated data flow

1. Discovery and source packs provide evidence for facts and page models.
2. Wiki claims, page briefs, and assets can flow back into the page model.
3. The pipeline renders pages and site assets under `public/` and writes reports under `public/generated/`. Recent working-tree output includes refreshed AI product demo page metadata, CTAs, downloadable assets, and visual assets; these are derived artifacts, not independent routing contracts.
4. The manifest-derived production set controls sitemap, robots, monitoring, analytics, and publication eligibility.
5. Review, feedback, and decision artifacts are persisted under `storage/` for later runs.

The [release gates](../operations/release-gates.md) consume these generated diagnostics before publication. The repository's Hermes [wiki content store](../../wiki/README.md) supplies content assets, but the generated OpenWiki pages are maintained separately under `/openwiki`.

## Change guidance

- Start with `config/route-manifest.json` when adding, removing, or reclassifying a public path.
- Check `config/page-intents.json` when changing a page's audience, CTA, proof, or forbidden-positioning contract.
- Check `scripts/run-pipeline.mjs` when changing generated outputs or pipeline stage order.
- Run `pnpm test -- test/route-manifest.test.mjs test/production-route-assets.test.mjs` for focused route/publication checks, then run `pnpm run validate` for the full contract.
