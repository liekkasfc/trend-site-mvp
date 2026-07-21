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
    assert.equal(report.score, 100)
    assert.equal(report.contentUniquenessScore, 10)
    assert.deepEqual(report.violations, [])
  })

  it('fails and removes uniqueness points when in-page duplicate ratio exceeds 20 percent', () => {
    const repeated = '<p>This repeated product demo evidence paragraph contains enough specific workflow detail to qualify as substantive content.</p>'.repeat(4)
    const report = evaluatePageAlignment(pageHtml().replace('</main>', `${repeated}</main>`), homeIntent, thesisContract)

    assert.equal(report.status, 'fail')
    assert.ok(report.duplicateRatio > 0.2)
    assert.equal(report.contentUniquenessScore, 0)
    assert.equal(report.score, 90)
    assert.ok(report.violations.some((item) => item.code === 'in_page_duplicate_ratio_high'))
  })

  it('awards five uniqueness points when in-page duplicate ratio is between 10 and 20 percent', () => {
    const repeated = '<p>This repeated product demo evidence paragraph contains enough specific workflow detail to qualify as substantive content.</p>'.repeat(2)
    const unique = Array.from(
      { length: 5 },
      (_, index) => `<p>Unique product demo evidence paragraph ${index} covers a separate workflow decision for SaaS product launch teams.</p>`,
    ).join('')
    const report = evaluatePageAlignment(pageHtml().replace('</main>', `${repeated}${unique}</main>`), homeIntent, thesisContract)

    assert.ok(report.duplicateRatio > 0.1 && report.duplicateRatio <= 0.2)
    assert.equal(report.contentUniquenessScore, 5)
    assert.equal(report.score, 95)
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
    assert.ok(report.pages.every((page) => page.contentUniquenessScore === 0))
    assert.ok(report.pages.every((page) => page.score === 90))
    assert.equal(report.siteScore, 90)
  })

  it('detects cross-page duplication for pages with five substantive paragraphs', () => {
    const shared = Array.from(
      { length: 3 },
      (_, index) => `<p>Shared short page evidence ${index} explains a specific product demo workflow decision for SaaS launch teams.</p>`,
    ).join('')
    const first = pageHtml({
      body: 'SaaS founders can turn a product screenshot into a product demo video using the first route specific workflow. Watch-out: UI text can drift.',
    }).replace('</main>', `${shared}<p>First route evidence explains its unique editing sequence for the product launch review.</p></main>`)
    const second = pageHtml({
      body: 'Product marketers can turn a feature update into a product demo video using the second route specific workflow. Watch-out: UI text can drift.',
    }).replace('</main>', `${shared}<p>Second route evidence explains its unique approval sequence for the product launch review.</p></main>`)
    const report = evaluateSiteAlignment(
      [{ path: '/', html: first }, { path: '/compare/', html: second }],
      { thesisKey: 'video-creation', thesisContract, pageIntents: [homeIntent, { ...homeIntent, path: '/compare/' }] },
    )

    assert.deepEqual(report.pages.map((page) => page.substantiveParagraphCount), [5, 5])
    assert.ok(report.pages.every((page) => page.violations.some((item) => item.code === 'cross_page_duplicate_ratio_high')))
    assert.ok(report.pages.every((page) => page.contentUniquenessScore === 0))
  })

  it('warns without failing duplicate analysis when fewer than four substantive paragraphs are available', () => {
    const report = evaluateSiteAlignment(
      [{ path: '/', html: pageHtml() }],
      { thesisKey: 'video-creation', thesisContract, pageIntents: [homeIntent] },
    )

    assert.equal(report.pages[0].status, 'pass')
    assert.ok(report.pages[0].substantiveParagraphCount < 4)
    assert.ok(report.pages[0].warnings.some((item) => item.code === 'insufficient_content_for_duplicate_analysis'))
    assert.ok(!report.pages[0].violations.some((item) => item.code === 'cross_page_duplicate_ratio_high'))
  })

  it('excludes navigation, footer, disclosure, and generic brand boilerplate from duplicate analysis', () => {
    const sharedSiteBoilerplate = Array.from(
      { length: 3 },
      (_, index) => `<p>Shared site boilerplate paragraph ${index} repeats across every route without expressing a route specific search intent.</p>`,
    ).join('')
    const shell = `
      <nav><p>Shared navigation paragraph with enough generic words to otherwise qualify as substantive duplicate content.</p></nav>
      <p data-affiliate-disclosure>Affiliate disclosure: we may earn a commission when readers purchase through links on this page.</p>
      <p class="brand-description">Automiora helps SaaS teams create concise product demo videos from product source material.</p>
      <section class="asset-preview-section"><p>Reusable asset preview copy belongs to the conversion module and not the route-specific editorial comparison.</p></section>
      ${sharedSiteBoilerplate}
      <footer><p>Shared footer paragraph with enough generic words to otherwise qualify as substantive duplicate content.</p></footer>`
    const uniqueParagraphs = (route) => Array.from(
      { length: 4 },
      (_, index) => `<p>${route} unique evidence paragraph ${index} explains a distinct product demo workflow decision for launch teams.</p>`,
    ).join('')
    const first = pageHtml().replace('</main>', `${shell}${uniqueParagraphs('First')}</main>`)
    const second = pageHtml({
      body: 'Product marketers can turn a feature update into a product demo video with a distinct comparison workflow. Watch-out: UI text can drift.',
    }).replace('</main>', `${shell}${uniqueParagraphs('Second')}</main>`)
    const third = pageHtml({
      body: 'SaaS founders can turn a screen recording into a product demo video with a distinct pricing workflow. Watch-out: UI text can drift.',
    }).replace('</main>', `${shell}${uniqueParagraphs('Third')}</main>`)
    const report = evaluateSiteAlignment(
      [{ path: '/', html: first }, { path: '/compare/', html: second }, { path: '/pricing/', html: third }],
      {
        thesisKey: 'video-creation',
        thesisContract,
        pageIntents: [homeIntent, { ...homeIntent, path: '/compare/' }, { ...homeIntent, path: '/pricing/' }],
      },
    )

    assert.equal(report.status, 'pass')
    assert.ok(report.pages.every((page) => page.substantiveParagraphCount === 5))
    assert.equal(report.excludedCommonParagraphCount, 3)
    assert.ok(report.pages.every((page) => !page.violations.some((item) => item.code === 'cross_page_duplicate_ratio_high')))
  })
})
