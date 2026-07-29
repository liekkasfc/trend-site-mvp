---
title: Hermes Wiki Schema
aliases:
  - Hermes Schema
  - LLM Wiki Schema
tags:
  - hermes/schema
  - hermes/governance
---

# Hermes Wiki Schema

## Core rule

> [!important]
> `id` and `type` are canonical. Frontmatter drives pipeline behavior. Tags are for human navigation and Obsidian ergonomics only.

## Card types in this vault

- `thesis`
- `cluster`
- `source`
- `claim`
- `page_brief`
- `conversion_asset`
- `review`
- `experiment`

## Minimum property sets

### Thesis

- `id`
- `type`
- `status`
- `label`
- `audience`
- `problem`
- `offer`
- `monetization`
- `primary_domain`
- `seed_keywords`
- `content_assets`

### Cluster

- `id`
- `type`
- `thesis_id`
- `status`
- `primary_keyword`
- `support_keywords`
- `intent_mix`
- `opportunity_score`
- `commercial_fit`
- `source_readiness`
- `site_slug`
- `target_pages`

### Source

- `id`
- `type`
- `thesis_id`
- `cluster_id`
- `source_kind`
- `title`
- `url`
- `domain`
- `published_at`
- `captured_at`
- `freshness_score`
- `credibility_score`
- `status`

### Claim

- `id`
- `type`
- `thesis_id`
- `cluster_id`
- `page_types`
- `claim_kind`
- `decision_stage`
- `confidence`
- `source_ids`
- `status`

### Page brief

- `id`
- `type`
- `thesis_id`
- `cluster_id`
- `page_type`
- `target_intent`
- `target_asset`
- `primary_claim_ids`
- `secondary_claim_ids`
- `required_sections`
- `cta_strategy`
- `review_priority`

### Conversion asset

- `id`
- `type`
- `thesis_id`
- `asset_kind`
- `status`
- `intent_stage`
- `delivery_mode`
- `primary_pages`
- `conversion_event`
- `click_event`
- `form_event`
- `delivery_event`
- `refresh_cycle`

### Review / experiment

- `id`
- `type`
- `target_id`
- `target_type`
- `signal_source`
- `finding`
- `decision`
- `action`
- `owner`
- `created_at`

## Recommended tag taxonomy

Tags are optional overlays. Use them for human-authored notes, MOCs, and manual overrides.

- Type tags:
  - `hermes/type/thesis`
  - `hermes/type/cluster`
  - `hermes/type/source`
  - `hermes/type/claim`
  - `hermes/type/page-brief`
  - `hermes/type/asset`
  - `hermes/type/review`
  - `hermes/type/experiment`
- Topic tags:
  - `hermes/thesis/video-creation`
  - `hermes/site/ai-video-workflow-short-form-demo`
- Operating tags:
  - `hermes/status/active`
  - `hermes/status/candidate`
  - `hermes/review-needed`

## Manual editing rules

1. Edit the Wiki card, not the generated HTML, if the change should survive the next pipeline run.
2. Add new judgment as a `claim`, `review`, or `experiment` card instead of burying it in a page draft.
3. Keep one object per note. Do not mix thesis, source notes, and page decisions in the same file.
4. Keep filenames stable. Changing copy should not force a note rename.

## Pipeline boundary

- `wiki/*` is canonical content memory.
- `public/generated/*` and `storage/*` are runtime outputs and snapshots.
- Generated pages should reuse `claim`, `page_brief`, and `conversion_asset` cards.
- Notes in this root layer can be manual and navigational. They should not become a second canonical data model.

## Obsidian usage rule

> [!tip]
> Use Bases to inspect structured cards. Use MOCs to steer humans. Use the generated notes themselves as the durable, machine-readable substrate.
