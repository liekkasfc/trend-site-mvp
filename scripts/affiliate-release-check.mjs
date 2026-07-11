import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMMERCIAL_PAGE_SPECS,
  getOfferFreshness,
  loadAffiliateConfig,
  parseBooleanFlag,
  resolveAffiliateUrl,
  safeArray,
  writeJson,
  writeText,
} from './affiliate-lib.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const publicDir = path.join(projectRoot, 'public')
const distDir = path.join(projectRoot, 'dist')
const outputJsonPath = path.join(publicDir, 'generated', 'affiliate-release-check.json')
const outputMarkdownPath = path.join(projectRoot, 'storage', 'affiliate-release-check.md')

function normalizeRoutePath(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === '/') return '/'
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`
}

function htmlPathForRoute(rootDir, routePath) {
  const normalized = normalizeRoutePath(routePath)
  if (normalized === '/') return path.join(rootDir, 'index.html')
  return path.join(rootDir, normalized.replace(/^\/+|\/+$/g, ''), 'index.html')
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isTestUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.test') ||
      hostname === 'example.com' ||
      hostname.endsWith('.example.com') ||
      hostname === 'example.test' ||
      hostname.endsWith('.example.test')
  } catch {
    return false
  }
}

function canonicalFor(routePath) {
  const siteBaseUrl = (process.env.SITE_BASE_URL || 'https://automiora.com').replace(/\/+$/, '')
  return new URL(normalizeRoutePath(routePath), `${siteBaseUrl}/`).toString()
}

function addCheck(checks, { label, ok, severity = 'critical', detail = '' }) {
  checks.push({
    label,
    ok: Boolean(ok),
    severity,
    detail,
  })
}

function hasPlaceholder(html) {
  return /\b(None yet|TODO|Lorem ipsum)\b/i.test(html) ||
    /\b(i personally used|we used|my team used)\b/i.test(html)
}

function renderMarkdown(report) {
  const lines = [
    '# Affiliate Release Check',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Feature enabled: ${report.featureEnabled}`,
    `- Test URLs allowed: ${report.allowTestUrls}`,
    '',
    '## Checks',
  ]

  for (const check of report.checks) {
    lines.push(`- ${check.ok ? 'pass' : 'fail'} [${check.severity}] ${check.label}`)
    if (check.detail) lines.push(`  - ${check.detail}`)
  }

  return `${lines.join('\n')}\n`
}

export async function runAffiliateReleaseCheck(options = {}) {
  const affiliateConfig = await loadAffiliateConfig(projectRoot)
  const allowTestUrls =
    Boolean(options.allowTestUrls) ||
    parseBooleanFlag(process.env.AFFILIATE_ALLOW_TEST_URLS, false)
  const featureEnabled = Boolean(affiliateConfig.feature.enabled)
  const generatedAt = new Date().toISOString()
  const checks = []
  const sitemapPath = path.join(publicDir, 'sitemap.xml')
  const sitemapXml = existsSync(sitemapPath) ? await readFile(sitemapPath, 'utf8') : ''

  addCheck(checks, {
    label: 'Affiliate feature flag is explicit',
    ok: typeof process.env.AFFILIATE_FEATURE_ENABLED !== 'undefined' || !featureEnabled,
    severity: 'warning',
    detail: featureEnabled ? 'Affiliate feature is enabled for this check.' : 'Affiliate feature is disabled.',
  })

  if (featureEnabled) {
    for (const offer of safeArray(affiliateConfig.offers).filter((item) => item.status === 'active')) {
      const resolved = resolveAffiliateUrl(offer, process.env)
      const freshness = getOfferFreshness(
        offer,
        generatedAt,
        affiliateConfig.thresholds.offerMaxAgeDays,
      )
      addCheck(checks, {
        label: `Offer URL configured: ${offer.id}`,
        ok: resolved.hasAffiliateUrl,
        detail: resolved.hasAffiliateUrl ? `${offer.affiliateUrlEnvKey} is set.` : `${offer.affiliateUrlEnvKey} is missing.`,
      })
      addCheck(checks, {
        label: `Offer URL uses HTTPS: ${offer.id}`,
        ok: resolved.hasAffiliateUrl && isHttpsUrl(resolved.href),
        detail: resolved.hasAffiliateUrl ? offer.affiliateUrlEnvKey : 'No URL configured.',
      })
      addCheck(checks, {
        label: `Offer URL is not a test domain: ${offer.id}`,
        ok: resolved.hasAffiliateUrl && (allowTestUrls || !isTestUrl(resolved.href)),
        detail: allowTestUrls ? 'Test domains explicitly allowed for this run.' : offer.affiliateUrlEnvKey,
      })
      addCheck(checks, {
        label: `Offer freshness: ${offer.id}`,
        ok: freshness.fresh,
        detail: `${freshness.status}; lastVerifiedAt=${freshness.lastVerifiedAt ?? 'unknown'}`,
      })
    }
  }

  for (const spec of COMMERCIAL_PAGE_SPECS) {
    const routePath = normalizeRoutePath(spec.publicPath)
    const publicHtmlPath = htmlPathForRoute(publicDir, routePath)
    const distHtmlPath = htmlPathForRoute(distDir, routePath)
    const publicExists = existsSync(publicHtmlPath)
    const distExists = existsSync(distHtmlPath)
    const html = publicExists ? await readFile(publicHtmlPath, 'utf8') : ''
    const expectedCanonical = canonicalFor(routePath)
    const affiliateCtaCount = (html.match(/data-ga4-event="affiliate_click"/g) ?? []).length

    addCheck(checks, {
      label: `Public HTML exists: ${routePath}`,
      ok: publicExists,
      detail: publicHtmlPath,
    })
    addCheck(checks, {
      label: `Dist HTML exists: ${routePath}`,
      ok: distExists,
      detail: distHtmlPath,
    })
    addCheck(checks, {
      label: `Sitemap includes ${routePath}`,
      ok: sitemapXml.includes(expectedCanonical),
      detail: expectedCanonical,
    })
    addCheck(checks, {
      label: `Page is indexable: ${routePath}`,
      ok: publicExists && !/<meta\s+name="robots"[^>]+noindex/i.test(html),
    })
    addCheck(checks, {
      label: `Canonical points to self: ${routePath}`,
      ok: publicExists && html.includes(`rel="canonical" href="${expectedCanonical}"`),
      detail: expectedCanonical,
    })
    addCheck(checks, {
      label: `No placeholders: ${routePath}`,
      ok: publicExists && !hasPlaceholder(html),
    })
    addCheck(checks, {
      label: `No test affiliate URL in production HTML: ${routePath}`,
      ok: publicExists && (allowTestUrls || !/https:\/\/[^"'\s>]+(?:example\.test|\.test)/i.test(html)),
      detail: allowTestUrls ? 'Test domains explicitly allowed for this run.' : '',
    })

    if (featureEnabled || affiliateCtaCount > 0) {
      addCheck(checks, {
        label: `Affiliate disclosure exists: ${routePath}`,
        ok: html.includes('This page contains affiliate links'),
      })
      addCheck(checks, {
        label: `Affiliate link rel is sponsored nofollow: ${routePath}`,
        ok: !/data-ga4-event="affiliate_click"[^>]+rel="(?![^"]*\bsponsored\b)(?![^"]*\bnofollow\b)/i.test(html) &&
          /rel="[^"]*\bsponsored\b[^"]*\bnofollow\b[^"]*"/i.test(html),
      })
      addCheck(checks, {
        label: `Affiliate GA4 click event exists: ${routePath}`,
        ok: affiliateCtaCount > 0,
      })
      addCheck(checks, {
        label: `Affiliate GA4 params do not leak URL: ${routePath}`,
        ok: !/data-ga4-params="[^"]*https?:/i.test(html),
      })
    }
  }

  addCheck(checks, {
    label: 'Sitemap excludes ops and ready pages',
    ok: !/\/ops\/|\/ready\/|thank-you/i.test(sitemapXml),
  })

  const criticalFailures = checks.filter((check) => !check.ok && check.severity === 'critical')
  const report = {
    generatedAt,
    status: criticalFailures.length === 0 ? 'pass' : 'fail',
    featureEnabled,
    allowTestUrls,
    checks,
    summary: {
      checks: checks.length,
      failures: checks.filter((check) => !check.ok).length,
      criticalFailures: criticalFailures.length,
    },
  }

  await writeJson(outputJsonPath, report)
  await writeText(outputMarkdownPath, renderMarkdown(report))
  return {
    ...report,
    artifacts: {
      json: outputJsonPath,
      markdown: outputMarkdownPath,
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAffiliateReleaseCheck({
    allowTestUrls: process.argv.includes('--allow-test-urls'),
  })
    .then((report) => {
      console.log(JSON.stringify({
        status: report.status,
        checks: report.summary.checks,
        failures: report.summary.failures,
        criticalFailures: report.summary.criticalFailures,
        artifacts: report.artifacts,
      }, null, 2))
      if (report.status !== 'pass') process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
