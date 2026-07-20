import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  renderActionsSummary,
  renderMarkdownReport,
} from '../scripts/release-prod.mjs'
import {
  isProductionPublishAllowed,
  normalizePublishGateStatus,
} from '../scripts/publish-gate.mjs'
import { runGa4RealtimeCheck } from '../scripts/check-ga4-realtime.mjs'
import {
  assertProductionUrl,
  getIndexableProductionPaths,
} from '../scripts/route-manifest.mjs'

const releaseScriptPath = new URL('../scripts/release-prod.mjs', import.meta.url)

describe('production release contract', () => {
  it('deploys Pages to the configured production branch', async () => {
    const source = await readFile(releaseScriptPath, 'utf8')

    assert.match(source, /getDefaultPagesBranch/)
    assert.match(source, /'--branch',\s*pagesBranch/)
  })

  it('retries release health while the production domain propagates', async () => {
    const source = await readFile(releaseScriptPath, 'utf8')

    assert.match(source, /runReleaseHealthWithRetry/)
    assert.match(source, /healthRetryAttempts/)
    assert.match(source, /healthRetryDelayMs/)
  })

  it('normalizes publish gate status without returning null', () => {
    assert.equal(normalizePublishGateStatus('pass'), 'pass')
    assert.equal(normalizePublishGateStatus('fail'), 'fail')
    assert.equal(normalizePublishGateStatus('needs_review'), 'warning')
    assert.equal(normalizePublishGateStatus(null), 'skipped')
  })

  it('publishes only pass while warning remains a recorded generation state', () => {
    assert.equal(isProductionPublishAllowed('pass'), true)
    assert.equal(isProductionPublishAllowed('warning'), false)
    assert.equal(isProductionPublishAllowed('fail'), false)
    assert.equal(isProductionPublishAllowed('skipped'), false)
    assert.equal(isProductionPublishAllowed(undefined), false)
  })

  it('checks the publish gate before any production deployment command', async () => {
    const source = await readFile(releaseScriptPath, 'utf8')
    const gateIndex = source.indexOf('const publishGate = await readPipelinePublishGate')
    const deploymentIndex = source.indexOf('await runReleaseSteps(deploymentSequence, report)')

    assert.ok(gateIndex >= 0)
    assert.ok(deploymentIndex > gateIndex)
  })

  it('keeps production routes on the route manifest and excludes generated-sites', () => {
    const paths = getIndexableProductionPaths()

    assert.ok(paths.includes('/'))
    assert.ok(paths.includes('/workflow/'))
    assert.ok(paths.includes('/compare/'))
    assert.ok(paths.includes('/pricing/'))
    assert.ok(paths.includes('/free-vs-paid/'))
    assert.ok(paths.includes('/templates/'))
    assert.ok(paths.includes('/case-study/'))
    assert.equal(assertProductionUrl('/generated-sites/ai-video-workflow-short-form-demo/index.html').ok, false)
  })
})

describe('GA4 realtime status contract', () => {
  it('returns pass only when all expected events and a page title are observed', async () => {
    const report = await runGa4RealtimeCheck({
      hasGoogleAuth: true,
      propertyId: '123',
      measurementId: 'G-TEST',
      expectedEvents: ['asset_cta_click', 'asset_delivery'],
      pageTitles: ['Prompt Pack delivery'],
      realtimeReporter: async (payload) => {
        if (payload.dimensions?.[0]?.name === 'eventName') {
          return {
            rows: [
              { dimensionValues: [{ value: 'asset_cta_click' }], metricValues: [{ value: '1' }] },
              { dimensionValues: [{ value: 'asset_delivery' }], metricValues: [{ value: '1' }] },
            ],
          }
        }
        if (payload.dimensions?.[0]?.name === 'unifiedScreenName') {
          return {
            rows: [
              { dimensionValues: [{ value: 'Prompt Pack delivery' }], metricValues: [{ value: '1' }] },
            ],
          }
        }
        return { rows: [{ metricValues: [{ value: '1' }] }] }
      },
    })

    assert.equal(report.status, 'pass')
    assert.equal(report.pass, true)
  })

  it('returns delayed when the realtime request succeeds but target events are absent', async () => {
    const report = await runGa4RealtimeCheck({
      hasGoogleAuth: true,
      propertyId: '123',
      measurementId: 'G-TEST',
      expectedEvents: ['asset_cta_click'],
      pageTitles: ['Prompt Pack delivery'],
      realtimeReporter: async () => ({ rows: [] }),
    })

    assert.equal(report.status, 'delayed')
    assert.equal(report.pass, false)
    assert.deepEqual(report.missingEvents, ['asset_cta_click'])
  })

  it('returns skipped for missing configuration and fail for request errors', async () => {
    const skipped = await runGa4RealtimeCheck({
      hasGoogleAuth: false,
      expectedEvents: ['asset_cta_click'],
    })
    const failed = await runGa4RealtimeCheck({
      hasGoogleAuth: true,
      propertyId: '123',
      measurementId: 'G-TEST',
      expectedEvents: ['asset_cta_click'],
      realtimeReporter: async () => {
        throw new Error('permission denied')
      },
    })
    const warning = await runGa4RealtimeCheck({
      hasGoogleAuth: true,
      propertyId: '123',
      measurementId: '',
      expectedEvents: ['asset_cta_click'],
      realtimeReporter: async () => ({ rows: [] }),
    })

    assert.equal(skipped.status, 'skipped')
    assert.equal(failed.status, 'fail')
    assert.equal(warning.status, 'warning')
    assert.ok(skipped.finalJudgement)
    assert.ok(failed.finalJudgement)
    assert.ok(warning.finalJudgement)
  })

  it('renders the exact JSON GA4 status into the Markdown and Actions summary source', async () => {
    const report = {
      generatedAt: '2026-07-21T00:00:00.000Z',
      siteBaseUrl: 'https://automiora.com',
      pagesProject: 'automiora',
      siteSlug: 'ai-video-workflow-short-form-demo',
      assetSlug: 'prompt-pack',
      overallStatus: 'warning',
      deploySteps: [],
      acceptance: {
        ga4: {
          status: 'delayed',
          checkedAt: '2026-07-21T00:00:00.000Z',
          waitMs: 8000,
          expectedEvents: ['asset_cta_click'],
          finalJudgement: 'Realtime data is delayed.',
        },
      },
    }
    const markdown = renderMarkdownReport(report)
    const actionsSummary = renderActionsSummary(report)
    const releaseSource = await readFile(releaseScriptPath, 'utf8')

    assert.match(markdown, /GA4 realtime: delayed/)
    assert.match(actionsSummary, /GA4 realtime: delayed/)
    assert.match(markdown, /Checked at: 2026-07-21T00:00:00.000Z/)
    assert.match(actionsSummary, /Checked at: 2026-07-21T00:00:00.000Z/)
    assert.match(markdown, /Wait: 8000ms/)
    assert.match(actionsSummary, /Wait: 8000ms/)
    assert.match(releaseSource, /GITHUB_STEP_SUMMARY/)
  })
})
