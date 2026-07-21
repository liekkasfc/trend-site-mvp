import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateHomepageCompositionHtml,
  defaultHomepageBudget,
} from '../scripts/homepage-composition-gate.mjs'

const baseBudget = {
  ...defaultHomepageBudget,
  primaryCtaText: 'Get the Product Demo Workflow Pack',
  secondaryCtaText: 'See the 5-Step Workflow',
}

function section(id, heading, body = '') {
  return `<section data-home-section="${id}"><h2>${heading}</h2>${body}</section>`
}

function passingHome(overrides = {}) {
  const sections = overrides.sections ?? [
    section(
      'starting-inputs',
      'Starting inputs',
      '<p>Product screenshots, screen recordings, and release notes become source material.</p>',
    ),
    section(
      'workflow-summary',
      'Three-step workflow',
      '<ol><li>Prepare source assets</li><li>Generate short shots</li><li>Review and assemble</li></ol><p><a href="/workflow/">Full workflow</a></p>',
    ),
    section(
      'tool-recommendation',
      'Compact tool recommendation',
      '<article data-tool-detail-card><strong>Runway</strong><p>Best for controlled SaaS product shots.</p><p data-tool-verdict>Best first pass for a controlled short SaaS demo.</p></article><article data-tool-detail-card><strong>Pika</strong><p>Best for punchier motion tests.</p><p data-tool-verdict>Best fallback when motion energy matters.</p></article><p><a href="/compare/">Full comparison</a></p>',
    ),
    section(
      'worked-example',
      'Internal worked example',
      '<p>Internal worked example: source assets were two product screenshots and one release note. Intended output was a 30 second onboarding demo. Tool: Runway. Attempts: 3. Time range: 45-60 minutes. Cost range: low-credit pilot. First failure: UI text drifted. Change made: narrowed the shot prompt. Final output: a clean 30 second demo draft.</p><p><a href="/case-study/">Full example</a></p>',
    ),
    section(
      'workflow-pack',
      'Workflow pack',
      '<p>Shot Planner, Prompt Matrix, Review Checklist, and Cost Worksheet. Filled example: feature update to three-shot onboarding demo.</p><p><a data-ga4-event="asset_cta_click" href="/prompt-pack/">Get the Product Demo Workflow Pack</a></p><p><a href="/templates/">Templates</a></p>',
    ),
  ]

  return `<!doctype html>
  <html>
    <head>
      <title>${overrides.title ?? 'SaaS product demo video workflow for founders'}</title>
      <meta name="description" content="${overrides.description ?? 'Turn product screenshots, screen recordings, feature updates, and release notes into a short SaaS product demo video.'}">
      <meta property="og:image" content="${overrides.ogImage ?? 'https://automiora.com/media/index-hero.png'}">
      <script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}</script>
    </head>
    <body>
      <nav><a href="/workflow/">Workflow</a><a href="/compare/">Compare</a><a href="/pricing/">Pricing</a><a href="/free-vs-paid/">Free vs Paid</a></nav>
      <header data-home-section="hero">
        <p>AI product demo workflow for SaaS teams</p>
        <h1>${overrides.h1 ?? 'Turn product screenshots and feature updates into a short SaaS demo video'}</h1>
        <p>SaaS founders, indie hackers, and product marketers can turn product screenshots, screen recordings, feature updates, and release notes into a 15-60 second SaaS product demo video.</p>
        <p>Proof: includes one filled planner and one review checklist.</p>
        <a data-ga4-event="asset_cta_click" href="/prompt-pack/">Get the Product Demo Workflow Pack</a>
        <a href="/workflow/">See the 5-Step Workflow</a>
        <figure><img src="/media/index-hero.png" alt="Filled SaaS demo workflow preview"></figure>
      </header>
      <main>${sections.join('')}</main>
      <footer><p>This page contains affiliate links.</p></footer>
    </body>
  </html>`
}

describe('homepage composition gate', () => {
  it('passes a six-section SaaS product demo homepage', () => {
    const report = evaluateHomepageCompositionHtml(passingHome(), { budget: baseBudget })

    assert.equal(report.status, 'pass')
    assert.equal(report.majorSectionCount, 6)
    assert.equal(report.primaryCtaOccurrences, 2)
    assert.equal(report.secondaryCtaOccurrences, 1)
    assert.deepEqual(report.violations, [])
  })

  it('fails when the homepage has seven or more major sections', () => {
    const html = passingHome({
      sections: [
        section('one', 'One'),
        section('two', 'Two'),
        section('three', 'Three'),
        section('four', 'Four'),
        section('five', 'Five'),
        section('six', 'Six'),
      ],
    })

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'major_sections_over_budget'))
  })

  it('fails when visible words exceed the budget', () => {
    const longCopy = Array.from({ length: 1401 }, (_, index) => `word${index}`).join(' ')
    const html = passingHome({
      sections: [
        section('starting-inputs', 'Starting inputs', `<p>${longCopy}</p>`),
        section('workflow-summary', 'Three-step workflow'),
        section('tool-recommendation', 'Compact tool recommendation'),
        section('worked-example', 'Internal worked example'),
        section('workflow-pack', 'Workflow pack'),
      ],
    })

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'visible_words_over_budget'))
  })

  it('fails when the prompt CTA appears three times', () => {
    const html = passingHome().replace(
      '</main>',
      `${section('extra-cta', 'Extra CTA', '<p>Get the Product Demo Workflow Pack</p>')}</main>`,
    )

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'primary_cta_over_budget'))
  })

  it('fails when a Runway verdict repeats', () => {
    const repeatedVerdict = '<p data-tool-verdict>Runway is the safest first pass for a controlled short SaaS demo.</p>'
    const html = passingHome({
      sections: [
        section('starting-inputs', 'Starting inputs'),
        section('workflow-summary', 'Three-step workflow'),
        section(
          'tool-recommendation',
          'Compact tool recommendation',
          `<article data-tool-detail-card><strong>Runway</strong>${repeatedVerdict}</article><article data-tool-detail-card><strong>Pika</strong>${repeatedVerdict}</article>`,
        ),
        section('worked-example', 'Internal worked example'),
        section('workflow-pack', 'Workflow pack'),
      ],
    })

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.repeatedVerdicts.length > 0)
  })

  it('fails when a full comparison table appears on the homepage', () => {
    const html = passingHome().replace(
      '<main>',
      '<main><table class="comparison-table"><thead><tr><th>Tool</th><th>Best for</th><th>NOT FOR</th><th>Hidden cost</th><th>When to switch</th><th>Quick verdict</th></tr></thead></table>',
    )

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'full_comparison_table_present'))
  })

  it('fails when the full workflow appears on the homepage', () => {
    const detailedSteps = Array.from(
      { length: 5 },
      (_, index) =>
        `<article class="step-item"><h3>Step ${index + 1}</h3><dl><dt>Input</dt><dd>A</dd><dt>Owner</dt><dd>B</dd><dt>Output</dt><dd>C</dd><dt>Failure point</dt><dd>D</dd></dl></article>`,
    ).join('')
    const html = passingHome().replace('</main>', `${section('full-workflow', 'Full workflow', detailedSteps)}</main>`)

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'full_workflow_present'))
  })

  it('fails when the homepage explains why it exists', () => {
    const html = passingHome().replace('Starting inputs', 'Why this homepage exists')

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'self_explaining_homepage'))
  })

  it('fails unlabelled fictional proof', () => {
    const html = passingHome().replace(
      'Internal worked example: source assets were two product screenshots',
      'Customer result: source assets were two product screenshots',
    )

    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'unlabelled_fictional_proof'))
  })

  it('passes a clearly labelled internal worked example', () => {
    const report = evaluateHomepageCompositionHtml(passingHome(), { budget: baseBudget })

    assert.equal(report.status, 'pass')
    assert.ok(report.visibleText.includes('Internal worked example'))
  })

  it('requires child-page links for deeper content', () => {
    const report = evaluateHomepageCompositionHtml(passingHome(), { budget: baseBudget })

    assert.equal(report.status, 'pass')
    for (const href of ['/compare/', '/workflow/', '/pricing/', '/free-vs-paid/', '/templates/', '/case-study/']) {
      assert.ok(report.childPageLinks.includes(href), `${href} should be linked`)
    }
  })

  it('does not strip analytics, affiliate disclosure, or lead-capture CTA checks', () => {
    const report = evaluateHomepageCompositionHtml(passingHome(), { budget: baseBudget })

    assert.equal(report.status, 'pass')
    assert.equal(report.integrationChecks.ga4, true)
    assert.equal(report.integrationChecks.leadCaptureCta, true)
    assert.equal(report.integrationChecks.affiliateDisclosurePreserved, true)
  })

  it('fails when the hero is still a fallback SVG placeholder', () => {
    const html = passingHome()
      .replace('/media/index-hero.png', '/media/index-hero.svg')
      .replace('<figure>', '<figure data-visual-mode="fallback">')
    const report = evaluateHomepageCompositionHtml(html, { budget: baseBudget })

    assert.equal(report.status, 'fail')
    assert.ok(report.violations.some((item) => item.code === 'fallback_hero_visual'))
  })
})
