---
id: "experiment.ai-video-workflow-short-form-demo.pause-expansion-and-review-whether-to-retire-the-cluster"
type: "experiment"
target_id: "cluster.ai-video-workflow-short-form-demo"
target_type: "cluster"
signal_source: "optimization"
finding: "Pause expansion and review whether to retire the cluster"
decision: "test"
action: "Two checkpoints in a row are sliding on traffic, click, and ranking signals, so the cluster is losing momentum."
owner: "pipeline"
created_at: "2026-07-11T14:05:07.489Z"
---
## What happened

Pause expansion and review whether to retire the cluster

## Signal observed

Two checkpoints in a row are sliding on traffic, click, and ranking signals, so the cluster is losing momentum.

## Why it matters

Some pages are still noindex or blocked, so the site may be suppressing its own discovery.

## Decision

Run this as the next optimization experiment.

## Next run change

- Apply to pages: index, alternatives, workflow
- Primary claim anchor: The right next step is to grab prompt pack before opening more tabs.
