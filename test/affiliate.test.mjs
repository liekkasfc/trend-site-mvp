import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  aggregateAffiliateRows,
  buildAffiliateGa4Payload,
  loadAffiliateConfig,
  parseFiverrCsv,
  readFiverrImportRowsWithMetadata,
  selectAffiliateModulesForPage,
} from '../scripts/affiliate-lib.mjs'
import { buildAffiliatePublicSummary } from '../scripts/build-affiliate-report.mjs'
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

  it('parses quoted fields, comma money, case-insensitive headers, and reports anomalies', () => {
    const csv = [
      'DATE,Tracking Code,COUNTRY,Clicks,Registrations,FTB,Commission',
      '2026-07-10,"automiora,tag",US,"1,234",12,2,"$1,234.56"',
      'not-a-date,automiora_ai_video_editor,US,-5,9,10,-12',
    ].join('\n')

    const rows = parseFiverrCsv(csv)
    const report = aggregateAffiliateRows(rows, ['automiora,tag', 'automiora_ai_video_editor'], generatedAt)

    assert.equal(rows[0].trackingCode, 'automiora,tag')
    assert.equal(rows[0].clicks, 1234)
    assert.equal(rows[0].commission, 1234.56)
    assert.equal(report.summary.clicks, 1234)
    assert.equal(report.summary.commission, 1234.56)
    assert.equal(report.anomalies.some((item) => item.includes('invalid dates')), true)
    assert.equal(report.anomalies.some((item) => item.includes('negative metrics')), true)
  })

  it('defaults to the latest Fiverr CSV and dedupes overlapping all-file imports', async () => {
    const importDir = mkdtempSync(path.join(tmpdir(), 'fiverr-import-'))
    try {
      const olderPath = path.join(importDir, 'older.csv')
      const latestPath = path.join(importDir, 'latest.csv')
      writeFileSync(
        olderPath,
        [
          'Date,Tracking Code,Country,Clicks,Registrations,FTB,Commission',
          '2026-07-10,automiora_ai_video_editor,US,10,1,0,$0.00',
        ].join('\n'),
      )
      writeFileSync(
        latestPath,
        [
          'Date,Tracking Code,Country,Clicks,Registrations,FTB,Commission',
          '2026-07-10,automiora_ai_video_editor,US,20,2,1,$9.00',
          '2026-07-10,automiora_ai_video_editor,US,20,2,1,$9.00',
        ].join('\n'),
      )
      utimesSync(olderPath, new Date('2026-07-10T00:00:00Z'), new Date('2026-07-10T00:00:00Z'))
      utimesSync(latestPath, new Date('2026-07-11T00:00:00Z'), new Date('2026-07-11T00:00:00Z'))

      const latestOnly = await readFiverrImportRowsWithMetadata(importDir)
      assert.deepEqual(latestOnly.metadata.importedFiles, ['latest.csv'])
      assert.equal(latestOnly.rows.length, 1)
      assert.equal(latestOnly.metadata.duplicateRowsSkipped, 1)

      const allFiles = await readFiverrImportRowsWithMetadata(importDir, { allFiles: true })
      assert.deepEqual(allFiles.metadata.importedFiles, ['older.csv', 'latest.csv'])
      assert.equal(allFiles.rows.length, 1)
      assert.equal(allFiles.rows[0].clicks, 20)
      assert.equal(allFiles.metadata.overlappingRowsReplaced, 1)
      assert.equal(allFiles.metadata.duplicateRowsSkipped, 1)
    } finally {
      rmSync(importDir, { recursive: true, force: true })
    }
  })

  it('returns an explicit no_data report for empty imports', () => {
    const report = aggregateAffiliateRows([], [], generatedAt)
    assert.equal(report.status, 'no_data')
    assert.equal(report.summary.clicks, 0)
    assert.equal(report.byTrackingCode.length, 0)
  })

  it('uses accurate public metric names and leaves true click rate unknown without session data', () => {
    const report = aggregateAffiliateRows([
      {
        date: '2026-07-10',
        trackingCode: 'automiora_ai_video_editor',
        country: 'US',
        clicks: 10,
        registrations: 2,
        ftb: 1,
        commission: 12,
      },
    ], ['automiora_ai_video_editor'], generatedAt)
    const summary = buildAffiliatePublicSummary(report)

    assert.equal(summary.affiliateClickRate, null)
    assert.equal(summary.affiliateClickRateStatus, 'unknown')
    assert.equal(summary.affiliateClickToRegistrationRate, 0.2)
    assert.equal(summary.affiliateClickToFtbRate, 0.1)
    assert.equal(summary.affiliateRegistrationToFtbRate, 0.5)
    assert.equal(summary.affiliateCommissionPerClick, 1.2)
    assert.equal(summary.affiliateCommissionPerFtb, 12)
    assert.ok(summary.deprecated.affiliateClickRate)
  })
})

describe('Pinterest pack generation', () => {
  it('builds review-required pins with required fields and unique IDs', () => {
    const pack = buildPinterestPack([
      {
        siteSlug: 'ai-video-workflow-short-form-demo',
        pageType: 'hire-service',
        slug: 'ai-video-editor',
        title: 'How to Hire an AI Video Editor',
        description: 'Prepare scope, rights, revisions, and delivery requirements before ordering.',
        path: '/hire/ai-video-editor/',
      },
    ], generatedAt.toISOString(), { siteBaseUrl: 'https://automiora.com' })

    assert.equal(pack.status, 'review_required')
    assert.equal(pack.summary.pinCount, 3)
    assert.equal(new Set(pack.pins.map((pin) => pin.id)).size, pack.pins.length)
    assert.equal(pack.pins.every((pin) => pin.destinationPath === '/hire/ai-video-editor/'), true)
    assert.deepEqual(pack.pins.map((pin) => pin.variant), ['Cost', 'Red flags', 'DIY vs Hire'])
    for (const pin of pack.pins) {
      assert.equal(pin.utmSource, 'pinterest')
      assert.equal(pin.utmMedium, 'organic')
      assert.equal(pin.status, 'review_required')
      assert.ok(pin.destinationUrl.startsWith('https://automiora.com/hire/ai-video-editor/'))
      assert.ok(pin.altText)
      assert.ok(pin.imagePrompt)
      assert.ok(pin.affiliateDisclosure)
    }
  })

  it('does not create pins when there are no eligible real pages', () => {
    const pack = buildPinterestPack([], generatedAt.toISOString())
    assert.equal(pack.status, 'no_eligible_pages')
    assert.equal(pack.summary.pinCount, 0)
    assert.deepEqual(pack.pins, [])
  })
})
