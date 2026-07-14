import assert from 'node:assert/strict'
import test from 'node:test'

import { comparePageBodies, detectUnlabeledFabricatedCaseStudy } from '../scripts/content-duplication-gate.mjs'
import { isOgImageCrawlable } from '../scripts/page-intent-contract.mjs'
import { scorePage } from '../scripts/thesis-alignment-gate.mjs'
import {
  getThesisContract,
  keywordAlignsWithThesis,
  loadExperiment,
} from '../scripts/thesis-contract.mjs'

function hubHtml(overrides = {}) {
  const {
    title = 'AI product demo video workflow for SaaS teams',
    h1 = 'Turn product screenshots and feature updates into a short SaaS demo video',
    lede = 'For SaaS founders, product marketers, and indie hackers: turn product screenshots, screen recordings, and release notes into a 15-60 second product demo video with Runway or Pika.',
    primaryCta = '/prompt-pack/',
    secondaryCta = '/workflow/',
    primaryLabel = 'Get the Product Demo Workflow Pack',
    secondaryLabel = 'See the Product Demo Workflow',
    body = 'Recommendation: start with Runway for product demos. Watch-out: do not burn credits on multi-job prompts. Worked example: repair the broken 5-8 second shot before switching tools.',
  } = overrides
  return `<!DOCTYPE html><html><head>
<title>${title}</title>
<meta name="description" content="${lede}" />
<meta property="og:image" content="https://automiora.com/media/index-hero.png" />
</head><body>
<p class="eyebrow">AI product demo workflow for SaaS teams</p>
<h1>${h1}</h1>
<p class="lede">${lede}</p>
<div class="hero-actions">
<a class="cta-button" href="${primaryCta}">${primaryLabel}</a>
<a class="secondary-cta" href="${secondaryCta}">${secondaryLabel}</a>
</div>
<main><p>${body}</p>
<p>Best for SaaS founders shipping a feature launch video.</p>
<p>Input: product screenshot. Output: product demo video.</p>
<p>Verdict: Runway first, Pika fallback.</p>
</main></body></html>`
}

test('experiment thesis contract pins product-demo positioning', () => {
  const experiment = loadExperiment()
  assert.equal(experiment.thesisKey, 'video-creation')
  assert.match(experiment.thesisLabel, /Product Demo/i)
  assert.ok(experiment.thesisContract?.requiredOutcomeTerms?.length)
  assert.ok(experiment.discoveryKeywords.every((keyword) => keywordAlignsWithThesis(keyword)))
})

test('generic standalone keywords fail thesis alignment guard', () => {
  assert.equal(keywordAlignsWithThesis('video'), false)
  assert.equal(keywordAlignsWithThesis('prompt'), false)
  assert.equal(keywordAlignsWithThesis('short-form'), false)
  assert.equal(keywordAlignsWithThesis('ai product demo video'), true)
  assert.equal(keywordAlignsWithThesis('saas demo video workflow'), true)
})

test('correct SaaS product demo hub passes', () => {
  const result = scorePage({ path: '/', html: hubHtml() })
  assert.equal(result.hardFails.length, 0, result.hardFails.join(', '))
  assert.ok(result.score >= 85, `score ${result.score}`)
  assert.equal(result.status, 'pass')
  assert.ok(result.sitemapEligible)
})

test('generic AI video hub fails hard gates', () => {
  const result = scorePage({
    path: '/',
    html: hubHtml({
      title: 'Best AI video tools and generators in 2026',
      h1: 'Create an AI video with the best AI video generator directory',
      lede: 'Explore all-purpose AI video tools for music video and cinematic story creators.',
      body: 'A general AI video portal for faceless channels and AI film inspiration.',
      primaryLabel: 'Create an AI video',
    }),
  })
  assert.ok(result.hardFails.length > 0)
  assert.equal(result.status, 'fail')
  assert.equal(result.sitemapEligible, false)
})

test('hub missing audience fails', () => {
  const result = scorePage({
    path: '/',
    html: hubHtml({
      lede: 'Turn files into a 15-60 second product demo video using screenshots and release notes.',
      body: 'Product demo video steps with Runway. Watch-out: generic prompts. Verdict: start narrow.',
    }),
  })
  // remove audience words
  result.matchedAudience = []
  const rescore = scorePage({
    path: '/',
    html: hubHtml({
      title: 'Product demo video steps',
      h1: 'Turn screenshots into a product demo video',
      lede: 'Turn screenshots and release notes into a 15-60 second product demo video.',
      body: 'Verdict: Runway first. Watch-out: credit burn. Proof: comparison worksheet.',
    }).replace(/SaaS founders|product marketers|indie hackers|founder|marketer/gi, 'visitor'),
  })
  assert.ok(
    rescore.hardFails.includes('hub_missing_audience') || rescore.violations.includes('missing_audience_above_fold'),
  )
})

test('hub missing input/output fails', () => {
  const html = hubHtml({
    lede: 'Help SaaS founders and product marketers ship faster with a better workflow and clear verdicts.',
    body: 'Recommendation for SaaS founders. Watch-out: skipping review. Verdict: keep it narrow.',
  }).replace(/screenshot|recording|release|feature update|product demo video|15-60|walkthrough/gi, 'content')
  const result = scorePage({ path: '/', html })
  assert.ok(
    result.hardFails.includes('hub_missing_inputs') ||
      result.hardFails.includes('hub_missing_outputs') ||
      result.violations.includes('missing_input_terms') ||
      result.violations.includes('missing_outcome_terms'),
  )
})

test('CTA mismatch fails page intent check', () => {
  const result = scorePage({
    path: '/compare/',
    html: hubHtml({
      title: 'Best AI video tools for product demos',
      h1: 'Runway vs Pika for product demo videos',
      lede: 'For product marketers comparing tools for SaaS product demos using screenshots.',
      primaryCta: '/faq/',
      secondaryCta: '/use-cases/',
      body: 'Verdict: Runway first for product demos. Watch-out: UI text handling. Not for music video.',
    }),
  })
  assert.ok(result.violations.some((item) => /cta/i.test(item)) || result.hardFails.includes('cta_intent_mismatch'))
})

test('forbidden positioning fails', () => {
  const result = scorePage({
    path: '/best-tools/',
    html: hubHtml({
      title: 'General AI video portal and generator directory',
      h1: 'All-purpose AI video generator directory',
      lede: 'A general AI video portal for cinematic story and music video creators.',
      body: 'Faceless channel tips and AI film inspiration. Verdict: browse everything.',
    }),
  })
  assert.ok(result.hardFails.includes('forbidden_positioning') || result.violations.some((v) => v.startsWith('forbidden:')))
})

test('high duplicate ratio fails duplication gate', () => {
  const shared = 'Start with Runway for product demos and keep Pika as the only fallback after a written failure reason appears twice.'
  const pageA = {
    path: '/workflow/',
    html: `<html><body><p>${shared}</p><p>Owner completes the product screenshot intake for SaaS founders.</p></body></html>`,
  }
  const pageB = {
    path: '/compare/',
    html: `<html><body><p>${shared}</p><p>Primary pick stays Runway for product demo tool comparison.</p></body></html>`,
  }
  const pageC = {
    path: '/pricing/',
    html: `<html><body><p>${shared}</p><p>Budget review minutes for product demo pilots.</p></body></html>`,
  }
  const result = comparePageBodies([pageA, pageB, pageC], { maxDuplicateRatio: 0.25 })
  assert.ok(result.issues.length > 0)
  assert.equal(result.pass, false)
})

test('unlabeled fabricated case study data fails', () => {
  const html = `<html><body><h1>Case study</h1><p>Acme Corp increased conversion 42% and saved $12000 after our AI video workflow.</p></body></html>`
  const result = detectUnlabeledFabricatedCaseStudy(html, '/case-study/')
  assert.equal(result.ok, false)
  assert.ok(result.violations.length > 0)
})

test('worked example label allows case study', () => {
  const html = `<html><body><h1>Worked example</h1><p>Worked example / internal test: before and after product demo sequence for a SaaS feature launch. No fabricated customer metrics.</p></body></html>`
  const result = detectUnlabeledFabricatedCaseStudy(html, '/case-study/')
  assert.equal(result.ok, true)
})

test('sitemap eligibility blocks failed pages', () => {
  const fail = scorePage({
    path: '/',
    html: hubHtml({
      title: 'Best AI video tools',
      h1: 'Create an AI video',
      lede: 'General portal',
    }),
  })
  assert.equal(fail.sitemapEligible, false)
})

test('OG image under generated-sites is not crawlable', () => {
  assert.equal(isOgImageCrawlable('https://automiora.com/generated-sites/demo/media/x.png'), false)
  assert.equal(isOgImageCrawlable('https://automiora.com/media/index-hero.png'), true)
  assert.equal(isOgImageCrawlable('/media/workflow-hero.svg'), true)
})

test('thesis contract exports gate pass score', () => {
  const contract = getThesisContract()
  assert.equal(contract.gateRules.passScore, 85)
})
