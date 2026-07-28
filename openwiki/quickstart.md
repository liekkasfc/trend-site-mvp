---
type: Repository Guide
title: Trend Site Pipeline Quickstart
description: Entry point for the Trend Site Pipeline repository, covering the evidence-driven content pipeline, manifest-driven production routes, release gates, validation commands, and generated outputs.
tags: [repository, quickstart, pipeline, publishing]
resource: file:///Users/max/code/trend-site-mvp/README.md
---

# Trend Site Pipeline

This repository is a locally runnable automation pipeline for turning a validated topic into a monitored, published topical site. The broad flow is discovery, validation, thesis routing, evidence collection, content generation, page construction, quality review, deployment, SEO submission, monitoring, and optimization. A topic is routed to an existing thesis, a candidate thesis, or rejection/watch rather than automatically becoming a new site.

The current production example is the AI product demo video workflow site for SaaS teams. Its public route inventory and page contracts are centralized in the [route manifest](architecture/pipeline-and-routing.md), while publication safety is enforced by the [release gates](operations/release-gates.md). The working tree also contains refreshed generated page/content assets; treat `wiki/` as the Hermes source store and `public/` as derived output.

## Start here

1. Install dependencies with `pnpm install`.
2. Run the local app with `pnpm run dev` or build it with `pnpm run build`.
3. Run the evidence/content pipeline with `pnpm run pipeline`. The pipeline writes runtime reports under `public/generated/` and review/history artifacts under `storage/`.
4. Run `pnpm run validate` before treating output as releasable. This combines lint, build, homepage and thesis gates, tests, affiliate checks, and syntax checks.
5. Use `pnpm run release:prod` only after the generated output passes the release checks.

## Repository map

- `config/` — thesis, experiment, design, page-intent, tool, affiliate, and route configuration.
- `scripts/` — pipeline orchestration, evidence processing, route handling, release checks, SEO, monitoring, and workers.
- `src/` — the Vite/React control surface.
- `workers/` — Cloudflare worker and D1/R2 integration code.
- `public/` — published and generated site output, including the current AI product demo video pages and downloadable workflow assets.
- `wiki/` — Hermes content-asset store containing theses, sources, claims, briefs, assets, and reviews; refreshed evidence and briefs feed generated pages, but this is not the generated OpenWiki documentation directory.
- `docs/` — operational, design, layout, implementation, and project-evaluation references.

## Core concepts

- The [pipeline and routing architecture](architecture/pipeline-and-routing.md) explains how configuration, evidence, page models, generated output, and the route manifest fit together.
- The [release gates and validation workflow](operations/release-gates.md) explains how thesis alignment, homepage composition, affiliate checks, tests, and publish status determine whether production publication is allowed.
- The [route manifest](../config/route-manifest.json) is the source of truth for production paths, page kinds, indexability, monitoring, analytics, CTA targets, asset/offer routes, and excluded prefixes.
- The [pipeline entrypoint](../scripts/run-pipeline.mjs) is the main orchestration boundary; it loads the manifest and page-intent contracts before generating output.

## Important outputs

- `public/generated/pipeline-report.json` — pipeline and publication status consumed by the control surface.
- `public/generated/homepage-composition-report.json` — homepage proof/composition diagnostics.
- `public/generated/thesis-alignment-report.json` — thesis and uniqueness diagnostics.
- `public/generated/review-queue.json` — pages requiring spot checks.
- `public/sitemap.xml` and `public/robots.txt` — crawl publication boundary derived from the production route set.
- `storage/` — pipeline history, decision logs, review overrides, feedback, and commercial/affiliate reports.

## Backlog

- Worker runtime and D1/R2 behavior — anchor: `workers/automiora-api/`; deferred because the recent changes primarily affected route, publication, and validation contracts.
- SEO submission and live monitoring internals — anchors: `scripts/seo-submit.mjs`, `scripts/refresh-live-monitoring.mjs`; deferred because the current update focused on the new canonical route and release gates.
