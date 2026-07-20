import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluatePageAlignment,
  evaluateSiteAlignment,
} from '../scripts/thesis-alignment-gate.mjs'

const thesisContract = {
  requiredAudienceTerms: ['SaaS founder', 'product marketer'],
  requiredInputTerms: ['product screenshot', 'screen recording', 'feature update'],
  requiredOutcomeTerms: ['product demo video', 'feature launch video'],
  requiredContextTerms: ['SaaS', 'product', 'feature', 'launch', 'demo'],
  forbiddenPrimaryContexts: ['music video', 'AI film', 'faceless channel'],
  claimLabels: ['verified_fact', 'sourced_claim', 'operator_recommendation', 'estimate', 'worked_example'],
}

const homeIntent = {
  path: '/',
  pageType: 'hub',
  primaryIntent: 'Help a SaaS founder turn product screenshots into a product demo video.',
  queryTerms: ['product demo video', 'SaaS demo video'],
  ctaTerms: ['Product Demo Workflow Pack'],
  requiredSignals: ['audience', 'input', 'outcome', 'proof', 'verdict', 'watchOut', 'cta'],
}

function pageHtml(overrides = {}) {
  return `<!doctype html>
  <html><head>
    <title>${overrides.title ?? 'SaaS product demo video workflow'}</title>
    <meta name="description" content="${overrides.description ?? 'A workflow for SaaS founders and product marketers.'}">
  </head><body><main>
    <h1>${overrides.h1 ?? 'Turn a product screenshot into a product demo video'}</h1>
    <p>${overrides.body ?? 'SaaS founders can turn a product screenshot or feature update into a product demo video. Operator recommendation: start with one short shot. Watch-out: UI text can drift.'}</p>
    <section data-proof-object><p><span data-claim-type="worked_example">Worked example</span>: three screenshots, three attempts, 45 minutes.</p></section>
    <p data-page-verdict>Verdict: use Runway for the controlled first pass.</p>
    <a data-primary-cta href="/prompt-pack/">Get the Product Demo Workflow Pack</a>
  </main></body></html>`
}

describe('thesis alignment gate', () => {
  it('passes a SaaS product-demo page with intent, proof, verdict, watch-out, and matching CTA', () => {
    const report = evaluatePageAlignment(pageHtml(), homeIntent, thesisContract)

    assert.equal(report.status, 'pass')
    assert.ok(report.score >= 85)
    assert.deepEqual(report.violations, [])
  })

  it('fails generic AI video positioning', () => {
    const html = pageHtml({
      title: 'AI video workflow tools',
      description: 'Choose any AI video tool for any creative project.',
      h1: 'Choose the best AI video workflow',
      body: 'Compare tools, prompts, and pricing for general social content. Watch-out: credits vary.',
    })
    const report = evaluatePageAlignment(html, homeIntent, thesisContract)

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'missing_thesis_outcome'))
  })

  it('fails a forbidden primary context', () => {
    const report = evaluatePageAlignment(
      pageHtml({ h1: 'Make a cinematic AI film or music video', body: 'Music video creators can make a cinematic AI film. Watch-out: credits vary.' }),
      homeIntent,
      thesisContract,
    )

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'forbidden_primary_context'))
  })

  it('fails when the CTA does not match the page intent', () => {
    const html = pageHtml().replace('Get the Product Demo Workflow Pack', 'Create any AI video')
    const report = evaluatePageAlignment(html, homeIntent, thesisContract)

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'cta_intent_mismatch'))
  })

  it('fails unlabelled customer proof', () => {
    const html = pageHtml().replace(
      '<span data-claim-type="worked_example">Worked example</span>: three screenshots, three attempts, 45 minutes.',
      'Customer result: conversion increased 42% after three attempts.',
    )
    const report = evaluatePageAlignment(html, homeIntent, thesisContract)

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'unlabelled_customer_proof'))
  })

  it('blocks sitemap eligibility only for pages that fail their intent contract', () => {
    const report = evaluateSiteAlignment(
      [
        { path: '/', html: pageHtml() },
        { path: '/compare/', html: pageHtml({ h1: 'Choose the best AI video workflow', body: 'Generic tool notes. Watch-out: credits vary.' }) },
      ],
      {
        thesisKey: 'video-creation',
        thesisContract,
        pageIntents: [homeIntent, { ...homeIntent, path: '/compare/', pageType: 'alternatives' }],
      },
    )

    assert.equal(report.status, 'fail')
    assert.deepEqual(report.sitemapEligiblePaths, ['/'])
    assert.deepEqual(report.blockedPaths, ['/compare/'])
  })

  it('fails a public page that has no page intent contract', () => {
    const report = evaluateSiteAlignment(
      [{ path: '/unknown/', html: pageHtml() }],
      { thesisKey: 'video-creation', thesisContract, pageIntents: [homeIntent] },
    )

    assert.equal(report.status, 'fail')
    assert.ok(report.pages[0].violations.some((item) => item.code === 'missing_page_intent_contract'))
  })

  it('fails high-value pages that repeat more than a quarter of their substantive paragraphs', () => {
    const repeated = Array.from(
      { length: 10 },
      (_, index) => `<p>Repeated evidence paragraph ${index} explains the same product demo workflow decision with enough words to fingerprint.</p>`,
    ).join('')
    const first = pageHtml().replace('</main>', `${repeated}</main>`)
    const second = pageHtml().replace('</main>', `${repeated}<p>A unique closing paragraph for the comparison route.</p></main>`)
    const report = evaluateSiteAlignment(
      [{ path: '/', html: first }, { path: '/compare/', html: second }],
      { thesisKey: 'video-creation', thesisContract, pageIntents: [homeIntent, { ...homeIntent, path: '/compare/' }] },
    )

    assert.equal(report.status, 'fail')
    assert.ok(report.pages.every((page) => page.violations.some((item) => item.code === 'cross_page_duplicate_ratio_high')))
  })
})
