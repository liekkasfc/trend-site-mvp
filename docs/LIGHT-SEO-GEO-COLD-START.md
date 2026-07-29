# Light SEO + GEO + Cold Start

For the current production site:

- `https://automiora.com/`
- `https://automiora.com/workflow/`
- `https://automiora.com/compare/`
- `https://automiora.com/prompt-pack/`
- `https://automiora.com/audit/`

This doc is intentionally narrow:

- keep SEO maintenance light
- keep GEO signals clear
- avoid heavy promotion
- avoid buying links or scaled-page expansion

## Week 1

### GSC URL Inspection

Run URL Inspection manually in Google Search Console for these five URLs:

| URL | Check | Good outcome | If not good |
| --- | --- | --- | --- |
| `https://automiora.com/` | Indexing status | URL is on Google | Request indexing once |
| `https://automiora.com/workflow/` | Crawl + canonical | Google-selected canonical is self | If not indexed, request indexing once and recheck internal links |
| `https://automiora.com/compare/` | Crawl + canonical | URL is on Google | If crawled but not indexed, wait before changing title |
| `https://automiora.com/prompt-pack/` | Crawl + render | URL is on Google | Confirm form page is indexable and not blocked |
| `https://automiora.com/audit/` | Crawl + render | URL is on Google | Confirm page is useful enough to stay indexable |

Record these fields for each page:

- `status`
- `last crawl`
- `referring page`
- `google-selected canonical`
- `user-declared canonical`
- `indexing allowed`
- `page fetch`
- `request indexing sent?`

Use this status shorthand:

- `indexed`
- `crawled_not_indexed`
- `discovered_not_indexed`
- `duplicate_or_canonicalized`
- `blocked`

### Week 1 Rules

- Do not change URL paths.
- Do not rewrite all titles at once.
- Do not republish the same page repeatedly.
- If a page is new and healthy, request indexing once and wait.
- If all five pages are crawlable, spend the rest of the week on distribution, not page surgery.

## Weekly Review

Check once per week for 2-4 weeks:

- indexed page count
- impressions
- clicks
- top queries
- top pages
- `asset_cta_click`
- `prompt_copy`
- `asset_delivery`
- `consult_request_submit`

Decision rules:

- `indexed + impressions rising`: do not over-edit; keep collecting signal
- `indexed + no clicks`: test title or description lightly on one page only
- `clicks + no CTA movement`: improve CTA copy or asset promise, not the whole site
- `no index + healthy crawlability`: wait, then re-request indexing once
- `no impressions after indexing`: tighten query/page match and add one relevant internal link

## GEO Basics

Keep these visible on public pages:

- one clear conclusion near the top
- one comparison table where relevant
- FAQ on pages with obvious buyer questions
- evidence and limitation language together
- visible freshness signal such as `Updated`

Do not do this:

- mass-produce thin pages
- remove caveats to sound more confident
- bury evidence behind generic copy
- make every page push the same CTA if the brief disagrees

## Distribution Targets

Keep cold-start small and specific:

- `X`: 1 post
- `Reddit`: 1 post in the most relevant subreddit
- `IndieHackers`: 1 build-in-public style post
- `Direct outreach`: 5-10 creators or operators who already make AI-assisted product/demo videos

Success is not vanity traffic. Success is:

- real clicks
- prompt copies
- asset downloads
- audit requests

## Copy Pack

### X

```text
I kept seeing the same problem with AI video tools:

people can generate clips,
but they still do not have a repeatable workflow for turning scripts, screenshots, and product updates into short-form demo videos.

So I put together a simple decision site + prompt pack:
https://automiora.com/

If you are testing AI video workflow tools, the most useful pages are:
- workflow: https://automiora.com/workflow/
- compare: https://automiora.com/compare/
- prompt pack: https://automiora.com/prompt-pack/

Would love feedback from people actually shipping demo videos.
```

### Reddit

```text
Title:
I made a practical AI video workflow checklist + prompt pack for short-form demo videos

Body:
I kept running into the same gap with AI video tools: there are lots of tool lists, but not many pages that help you decide what to use, what to test first, and where the weak spots are.

I put together a small site for one narrow use case: short-form product/demo videos.

Main pages:
- workflow guide: https://automiora.com/workflow/
- comparison page: https://automiora.com/compare/
- prompt pack: https://automiora.com/prompt-pack/

I tried to keep the recommendations tied to evidence and limitations instead of pretending every tool is good at everything.

If you already make AI-assisted demo videos, I would really like to know:
1. where your workflow breaks
2. which tool comparison is still missing
3. whether the prompt pack is actually useful or still too generic
```

### IndieHackers

```text
Title:
Launched a narrow decision site for AI video workflow, now validating search + conversion

Body:
I shipped a small content/product hybrid around one narrow topic: AI video workflow for short-form product and demo content.

The current goal is not scale. It is to validate whether a small set of pages can earn:
- search impressions
- qualified clicks
- prompt pack downloads
- audit requests

Live pages:
- home: https://automiora.com/
- workflow: https://automiora.com/workflow/
- compare: https://automiora.com/compare/
- prompt pack: https://automiora.com/prompt-pack/
- audit: https://automiora.com/audit/

I am deliberately avoiding:
- buying links
- mass-generating pages
- spraying posts everywhere

I am looking for feedback from people who actually create short-form demos with AI tools:
- which page feels most useful
- which claim still feels weak
- whether the CTA/asset pair is worth the email
```

### Direct Outreach

```text
Subject:
Quick feedback on an AI video workflow prompt pack?

Message:
I built a small resource for people making short-form product/demo videos with AI tools.

It is not a generic tool list. It is more of a workflow + comparison + prompt pack combo:
https://automiora.com/

If you have 5 minutes, I would love blunt feedback on one thing:
does the prompt pack or workflow page help you get to a first usable demo faster?

Useful links:
- workflow: https://automiora.com/workflow/
- compare: https://automiora.com/compare/
- prompt pack: https://automiora.com/prompt-pack/

No pressure to share publicly. Even a quick “too generic” or “missing X step” would help a lot.
```

## What To Change Only After Signal

- If `workflow/` gets impressions first, strengthen `workflow -> comparison-worksheet`
- If `compare/` gets impressions first, improve verdict clarity and evidence framing
- If `prompt-pack/` gets clicks but weak submit rate, tighten the asset promise
- If `audit/` gets visits but no submit, reduce friction and sharpen the audit outcome

## Current Baseline

As of `2026-05-07` / `2026-05-08`:

- production deploy: pass
- GSC sitemap submit: pass
- IndexNow submit: pass
- GA4 asset funnel smoke: pass
- current live search visibility: still effectively unproven

The right move now is not scale. It is disciplined observation plus a small amount of targeted distribution.
