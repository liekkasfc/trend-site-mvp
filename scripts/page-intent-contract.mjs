import path from 'node:path'
import {
  loadJson,
  normalizeText,
  projectRoot,
  safeArray,
} from './thesis-contract.mjs'

export function loadPageIntents(relativePath = 'config/page-intents.json') {
  return loadJson(relativePath)
}

export function normalizePublicPath(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '/') return '/'
  let pathOnly = raw
  try {
    if (/^https?:\/\//i.test(raw)) pathOnly = new URL(raw).pathname
  } catch {
    pathOnly = raw
  }
  const cleaned = `/${pathOnly.replace(/^\/+|\/+$/g, '')}/`
  return cleaned === '//' ? '/' : cleaned
}

export function getPageIntentMap(intents = loadPageIntents()) {
  const map = new Map()
  for (const page of safeArray(intents.pages)) {
    map.set(normalizePublicPath(page.path), page)
  }
  return map
}

export function getPageIntent(pathname, intents = loadPageIntents()) {
  return getPageIntentMap(intents).get(normalizePublicPath(pathname)) ?? null
}

export function listHighValuePaths(intents = loadPageIntents()) {
  return safeArray(intents.pages)
    .filter((page) => page.highValue)
    .map((page) => normalizePublicPath(page.path))
}

export function pageIntentMatchesText(intent, text) {
  if (!intent) return { ok: false, reasons: ['missing_page_intent'] }
  const haystack = normalizeText(text)
  const reasons = []
  const queryHits = safeArray(intent.primaryQueryCluster).filter((query) =>
    haystack.includes(normalizeText(query).split(' ').slice(0, 3).join(' ')) ||
    normalizeText(query)
      .split(' ')
      .filter((token) => token.length > 3)
      .some((token) => haystack.includes(token)),
  )
  if (queryHits.length === 0) {
    // softer: require product+demo context for product-demo pages
    const needsProductDemo = safeArray(intent.primaryQueryCluster).some((q) =>
      /product demo|saas demo|walkthrough|launch video/i.test(q),
    )
    if (needsProductDemo && !/product demo|saas|walkthrough|feature launch|screenshot/i.test(haystack)) {
      reasons.push('primary_query_cluster_not_reflected')
    }
  }

  if (intent.primaryCta?.href) {
    const href = normalizeText(intent.primaryCta.href)
    if (!normalizeText(text).includes(href.replace(/\//g, ' ').trim()) && !text.includes(intent.primaryCta.href)) {
      // CTA href may be only in HTML attributes - caller should pass HTML
    }
  }

  return { ok: reasons.length === 0, reasons, queryHits }
}

export function ctaMatchesIntent(intent, primaryHref, secondaryHref = '') {
  if (!intent) return { ok: false, reasons: ['missing_page_intent'] }
  const reasons = []
  const expectedPrimary = normalizePublicPath(intent.primaryCta?.href || '')
  const expectedSecondary = normalizePublicPath(intent.secondaryCta?.href || '')
  const primary = normalizePublicPath(primaryHref || '')
  const secondary = normalizePublicPath(secondaryHref || '')

  if (expectedPrimary && expectedPrimary !== '/' && primary && primary !== expectedPrimary) {
    // allow equivalent asset families
    const related = areRelatedConversionPaths(expectedPrimary, primary)
    if (!related) reasons.push(`primary_cta_mismatch: expected ${expectedPrimary}, got ${primary}`)
  }
  // Secondary is soft unless both sides are real conversion paths and clearly mismatched.
  if (
    expectedSecondary &&
    secondary &&
    expectedSecondary !== '/' &&
    secondary !== '/' &&
    secondary !== expectedSecondary
  ) {
    const related = areRelatedConversionPaths(expectedSecondary, secondary)
    if (!related) {
      // soft warning only when primary already matches
      if (!primary || reasons.some((item) => item.startsWith('primary_cta'))) {
        reasons.push(`secondary_cta_mismatch: expected ${expectedSecondary}, got ${secondary}`)
      }
    }
  }
  return { ok: !reasons.some((item) => item.startsWith('primary_cta')), reasons }
}

function areRelatedConversionPaths(expected, actual) {
  if (expected === actual) return true
  const families = [
    ['/prompt-pack', '/prompt-pack'],
    ['/workflow', '/workflow'],
    ['/compare', '/compare', '/best-tools'],
    ['/audit', '/audit'],
    ['/comparison-worksheet', '/comparison-worksheet'],
    ['/workflow-checklist', '/workflow-checklist'],
    ['/pricing', '/pricing', '/free-vs-paid', '/cost'],
    ['/hire', '/hire', '/guides'],
  ]
  return families.some(
    (family) =>
      family.some((prefix) => expected.startsWith(prefix)) &&
      family.some((prefix) => actual.startsWith(prefix)),
  )
}

export function resolvePublicHtmlPath(pathname) {
  const normalized = normalizePublicPath(pathname)
  if (normalized === '/') return path.join(projectRoot, 'public', 'index.html')
  const relative = normalized.replace(/^\/+|\/+$/g, '')
  return path.join(projectRoot, 'public', relative, 'index.html')
}

export function isOgImageCrawlable(urlOrPath) {
  if (!urlOrPath) return false
  const value = String(urlOrPath)
  if (value.includes('/generated-sites/')) return false
  if (value.includes('/ops/')) return false
  return (
    value.includes('/media/') ||
    value.startsWith('/media/') ||
    /\/media\//.test(value)
  )
}
