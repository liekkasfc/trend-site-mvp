import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  aggregateAffiliateRows,
  buildAffiliateGa4Payload,
  loadAffiliateConfig,
  parseFiverrCsv,
  selectAffiliateModulesForPage,
} from '../scripts/affiliate-lib.mjs'
import { buildPinterestPack } from '../scripts/generate-pinterest-pack.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const generatedAt = new Date('2026-07-11T12:00:00Z')

const envWithUrls = {
  AFFILIATE_FEATURE_ENABLED: 'true',
  AFFILIATE_OFFER_MAX_AGE_DAYS: '30',
  FIVERR_AI_VIDEO_EDITOR_URL: 'https://go.example.test/fiverr-ai-video-editor',
  FIVERR_PRODUCT_DEMO_VIDEO_URL: 'https://go.example.test/fiverr-product-demo',
  FIVERR_SHORT_FORM_EDITOR_URL: 'https://go.example.test/fiverr-short-form',
  FIVERR_VIDEO_SCRIPTWRITER_URL: 'https://go.example.test/fiverr-scriptwriter',
  FIVERR_VOICE_OVER_URL: 'https://go.example.test/fiverr-voice-over',
  FIVERR_MOTION_GRAPHICS_URL: 'https://go.example.test/fiverr-motion-graphics',
}

const commercialPage = {
  slug: 'ai-video-diy-vs-freelancer',
  type: 'diy-vs-hire',
  title: 'AI Video DIY vs Hiring a Freelancer',
  metaDescription: 'Compare cost, time, outsourcing triggers, and when to hire an AI video freelancer.',
  intro: 'Use this guide to decide whether to DIY, use templates, or hire a professional.',
  commercialIntentScore: 90,
}

describe('affiliate config and module selection', () => {
  it('validates the bundled Fiverr program and unique tracking codes', async () => {
    const config = await loadAffiliateConfig(projectRoot, envWithUrls)
    assert.equal(config.validation.ok, true)
    assert.equal(config.validation.issues.length, 0)
    assert.equal(new Set(config.offers.map((offer) => offer.trackingCode)).size, config.offers.length)
  })

  it('does not select modules when the feature flag is disabled', async () => {
    const config = await loadAffiliateConfig(projectRoot, {
      ...envWithUrls,
      AFFILIATE_FEATURE_ENABLED: 'false',
    })

    const selection = selectAffiliateModulesForPage({
      page: commercialPage,
      config,
      env: envWithUrls,
      generatedAt,
      preferredOfferIds: ['fiverr-ai-video-editor'],
    })

    assert.equal(selection.modules.length, 0)
    assert.equal(selection.disclosureRequired, false)
  })

  it('does not select modules for non-commercial page types', async () => {
    const config = await loadAffiliateConfig(projectRoot, envWithUrls)
    const selection = selectAffiliateModulesForPage({
      page: {
        ...commercialPage,
        slug: 'workflow',
        type: 'workflow',
      },
      config,
      env: envWithUrls,
      generatedAt,
      preferredOfferIds: ['fiverr-ai-video-editor'],
    })

    assert.equal(selection.modules.length, 0)
    assert.equal(selection.checks.diagnostics[0].status, 'page_not_eligible')
  })

  it('requires a real affiliate URL from env before rendering a module', async () => {
    const config = await loadAffiliateConfig(projectRoot, {
      AFFILIATE_FEATURE_ENABLED: 'true',
      AFFILIATE_OFFER_MAX_AGE_DAYS: '30',
    })

    const selection = selectAffiliateModulesForPage({
      page: commercialPage,
      config,
      env: {},
      generatedAt,
      preferredOfferIds: ['fiverr-ai-video-editor'],
    })

    assert.equal(selection.modules.length, 0)
    assert.equal(selection.checks.diagnostics[0].status, 'missing_affiliate_url')
  })

  it('selects only fresh active offers and keeps GA4 payload URL-free', async () => {
    const config = await loadAffiliateConfig(projectRoot, envWithUrls)
    const selection = selectAffiliateModulesForPage({
      page: commercialPage,
      config,
      env: envWithUrls,
      generatedAt,
      preferredOfferIds: ['fiverr-ai-video-editor', 'fiverr-product-demo-video'],
    })

    assert.equal(selection.modules.length, 2)
    assert.equal(selection.disclosureRequired, true)
    assert.match(selection.modules[0].linkRel, /\bsponsored\b/)
    assert.match(selection.modules[0].linkRel, /\bnofollow\b/)

    const payload = buildAffiliateGa4Payload({
      page: commercialPage,
      module: selection.modules[0],
    })

    assert.equal(payload.offer_id, 'fiverr-ai-video-editor')
    assert.equal(payload.tracking_code, 'automiora_ai_video_editor')
    assert.equal(Object.values(payload).some((value) => String(value).startsWith('http')), false)
  })

  it('skips stale offers even when the env URL exists', async () => {
    const config = await loadAffiliateConfig(projectRoot, envWithUrls)
    const staleConfig = {
      ...config,
      offers: config.offers.map((offer) =>
        offer.id === 'fiverr-ai-video-editor'
          ? { ...offer, lastVerifiedAt: '2026-05-01' }
          : offer,
      ),
    }

    const selection = selectAffiliateModulesForPage({
      page: commercialPage,
      config: staleConfig,
      env: envWithUrls,
      generatedAt,
      preferredOfferIds: ['fiverr-ai-video-editor'],
    })

    assert.equal(selection.modules.length, 0)
    assert.equal(selection.checks.diagnostics[0].status, 'offer_not_fresh')
  })
})

describe('affiliate report import', () => {
  it('parses Fiverr CSV aliases and aggregates metrics by tracking code', () => {
    const csv = [
      'Date,AFP,Country,Clicks,Registrations,First Time Buyer,Commission',
      '2026-07-10,automiora_ai_video_editor,US,10,2,1,$12.50',
      '2026-07-09,automiora_voice_over,CA,4,1,0,$0.00',
    ].join('\n')

    const rows = parseFiverrCsv(csv)
    const report = aggregateAffiliateRows(rows, ['automiora_ai_video_editor'], generatedAt)

    assert.equal(rows.length, 2)
    assert.equal(report.status, 'ok')
    assert.equal(report.summary.clicks, 14)
    assert.equal(report.summary.registrations, 3)
    assert.equal(report.summary.ftb, 1)
    assert.equal(report.summary.commission, 12.5)
    assert.deepEqual(report.unmatchedTrackingCodes, ['automiora_voice_over'])
  })

  it('returns an explicit no_data report for empty imports', () => {
    const report = aggregateAffiliateRows([], [], generatedAt)
    assert.equal(report.status, 'no_data')
    assert.equal(report.summary.clicks, 0)
    assert.equal(report.byTrackingCode.length, 0)
  })
})

describe('Pinterest pack generation', () => {
  it('builds review-required pins with unique IDs', () => {
    const pack = buildPinterestPack([
      {
        siteSlug: 'ai-video-workflow-short-form-demo',
        pageType: 'hire-service',
        slug: 'ai-video-editor',
        title: 'How to Hire an AI Video Editor',
        description: 'Prepare scope, rights, revisions, and delivery requirements before ordering.',
        path: '/hire/ai-video-editor/',
      },
    ], generatedAt.toISOString())

    assert.equal(pack.status, 'review_required')
    assert.equal(pack.summary.pinCount, 3)
    assert.equal(new Set(pack.pins.map((pin) => pin.id)).size, pack.pins.length)
    assert.equal(pack.pins.every((pin) => pin.destinationPath === '/hire/ai-video-editor/'), true)
  })
})
