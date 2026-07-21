import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterProductionUrls,
  getAnalyticsPaths,
  getExcludedProductionPrefixes,
  getIndexableProductionPaths,
  getMonitoringPaths,
  getProductionPathForPageType,
  loadRouteManifest,
  resolvePageIntentContracts,
  validateRouteManifest,
} from '../scripts/route-manifest.mjs'

function cloneManifest() {
  return structuredClone(loadRouteManifest())
}

describe('route manifest validation', () => {
  it('fails fast for duplicate paths, unknown CTA targets, and invalid monitoring routes', () => {
    const duplicate = cloneManifest()
    duplicate.productionRoutes.push({ ...duplicate.productionRoutes[0] })
    assert.throws(() => validateRouteManifest(duplicate), /duplicate production route/i)

    const unknownCta = cloneManifest()
    unknownCta.productionRoutes[0].ctaHref = '/missing-offer/'
    assert.throws(() => validateRouteManifest(unknownCta), /CTA target/i)

    const invalidMonitoring = cloneManifest()
    invalidMonitoring.productionRoutes[0].monitoring = false
    invalidMonitoring.productionRoutes[0].analytics = false
    assert.throws(() => validateRouteManifest(invalidMonitoring), /root route.*monitoring.*analytics/i)
  })

  it('derives page types, CTA targets, monitoring, analytics, and blocked prefixes from one manifest', () => {
    const manifest = loadRouteManifest()
    const workflowPath = getProductionPathForPageType('workflow', { manifest })
    const [workflowIntent] = resolvePageIntentContracts(
      [{ pageType: 'workflow', presentation: { title: 'Workflow' } }],
      { manifest },
    )

    assert.equal(workflowPath, '/workflow/')
    assert.equal(workflowIntent.path, '/workflow/')
    assert.equal(workflowIntent.presentation.primaryCtaHref, '/workflow-checklist/')
    assert.ok(getMonitoringPaths({ manifest }).includes('/workflow/'))
    assert.ok(getAnalyticsPaths({ manifest }).includes('/workflow-checklist/ready/'))
    assert.deepEqual(
      getExcludedProductionPrefixes({ manifest }),
      ['/generated-sites/', '/ops/', '/downloads/'],
    )
  })
})

describe('production URL eligibility', () => {
  it('keeps only indexable manifest routes and excludes gate-failed pages from sitemap input', () => {
    const manifest = loadRouteManifest()
    const urls = [
      'https://automiora.com/',
      'https://automiora.com/workflow/',
      'https://automiora.com/generated-sites/ai-video-workflow-short-form-demo/index.html',
      'https://automiora.com/prompt-pack/ready/',
    ]

    assert.deepEqual(
      filterProductionUrls(urls, { manifest, blockedPaths: ['/workflow/'] }),
      ['https://automiora.com/'],
    )
    assert.ok(getIndexableProductionPaths({ manifest }).includes('/prompt-pack/'))
    assert.ok(!getIndexableProductionPaths({ manifest }).includes('/prompt-pack/ready/'))
  })
})
