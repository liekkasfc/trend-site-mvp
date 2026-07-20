import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getProductionRouteByIntent, loadRouteManifest } from './route-manifest.mjs'

const routeManifest = loadRouteManifest()

function manifestPathForIntent(intent) {
  return getProductionRouteByIntent(intent, { manifest: routeManifest }).path
}

export const AFFILIATE_ALLOWED_PAGE_TYPES = [
  'cost-guide',
  'diy-vs-hire',
  'hire-service',
  'service-comparison',
  'commercial-guide',
]

export const COMMERCIAL_PAGE_SPECS = [
  {
    pageType: 'diy-vs-hire',
    slug: 'ai-video-diy-vs-freelancer',
    navLabel: 'DIY vs Hire',
    publicPath: manifestPathForIntent('diy-vs-hire'),
    title: 'AI Video DIY vs Hiring a Freelancer: Cost and Fit',
    metaDescription:
      'Decide when to create AI video yourself, when to use templates, and when hiring a freelancer is safer for the project.',
    primaryOfferIds: ['fiverr-ai-video-editor', 'fiverr-product-demo-video'],
    commercialIntentScore: 86,
  },
  {
    pageType: 'cost-guide',
    slug: 'ai-video-production-cost',
    navLabel: 'Cost Guide',
    publicPath: manifestPathForIntent('cost-guide'),
    title: 'AI Video Production Cost: Tools, Retries, and Hiring',
    metaDescription:
      'Break down AI video tool costs, retry costs, voice-over, editing, and outsourcing without inventing a single market average.',
    primaryOfferIds: [
      'fiverr-ai-video-editor',
      'fiverr-voice-over-artist',
      'fiverr-motion-graphics',
    ],
    commercialIntentScore: 88,
  },
  {
    pageType: 'hire-service',
    slug: 'ai-video-editor',
    navLabel: 'Hire Editor',
    publicPath: manifestPathForIntent('hire-service'),
    title: 'How to Hire an AI Video Editor: Scope and Red Flags',
    metaDescription:
      'Use this hiring checklist to scope an AI video edit, prepare assets, avoid red flags, and ask better questions before ordering.',
    primaryOfferIds: [
      'fiverr-ai-video-editor',
      'fiverr-short-form-video-editor',
      'fiverr-video-scriptwriter',
    ],
    commercialIntentScore: 92,
  },
]

export const HEADER_ALIASES = {
  clicks: ['clicks', 'click'],
  registrations: ['registrations', 'registration'],
  ftb: ['ftb', 'qftb', 'first time buyer'],
  commission: ['commission', 'commissions'],
  trackingCode: ['tracking code', 'trackingcode', 'afp'],
  afp: ['afp'],
  country: ['country'],
  date: ['date'],
}

export function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export function meaningfulText(value) {
  return String(value ?? '').trim()
}

export function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value ?? '')
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .trim()
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function round(value, digits = 4) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

export function dedupe(values) {
  return [...new Set(safeArray(values).filter(Boolean))]
}

export function daysBetween(dateA, dateB = new Date()) {
  const left = new Date(dateA)
  const right = new Date(dateB)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return Number.POSITIVE_INFINITY
  return Math.floor((right.getTime() - left.getTime()) / 86400000)
}

export function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

export function getAffiliateFeatureConfig(env = process.env) {
  return {
    enabled: parseBooleanFlag(env.AFFILIATE_FEATURE_ENABLED, false),
    disclosureMode: meaningfulText(env.AFFILIATE_DISCLOSURE_MODE) || 'page',
    offerMaxAgeDays: parsePositiveInt(env.AFFILIATE_OFFER_MAX_AGE_DAYS, 30),
  }
}

export async function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function loadAffiliateConfig(projectRoot, env = process.env) {
  const configRoot = path.join(projectRoot, 'config')
  const [programs, offers, thresholds] = await Promise.all([
    readJsonIfExists(path.join(configRoot, 'affiliate-programs.json'), []),
    readJsonIfExists(path.join(configRoot, 'affiliate-offers.json'), []),
    readJsonIfExists(path.join(configRoot, 'affiliate-thresholds.json'), {}),
  ])
  const feature = getAffiliateFeatureConfig(env)
  const normalizedThresholds = {
    minCommercialIntentScore: toNumber(thresholds.minCommercialIntentScore, 65),
    offerMaxAgeDays: parsePositiveInt(
      env.AFFILIATE_OFFER_MAX_AGE_DAYS,
      parsePositiveInt(thresholds.offerMaxAgeDays, feature.offerMaxAgeDays),
    ),
    maxAffiliateModulesPerPage: parsePositiveInt(thresholds.maxAffiliateModulesPerPage, 2),
    maxAffiliateCtasPerPage: parsePositiveInt(thresholds.maxAffiliateCtasPerPage, 3),
    insufficientDataClicks: parsePositiveInt(thresholds.insufficientDataClicks, 100),
    conversionReviewClicks: parsePositiveInt(thresholds.conversionReviewClicks, 100),
    highPriorityConversionReviewClicks: parsePositiveInt(
      thresholds.highPriorityConversionReviewClicks,
      500,
    ),
    minPublishedDaysForPerformanceDecision: parsePositiveInt(
      thresholds.minPublishedDaysForPerformanceDecision,
      14,
    ),
  }

  return {
    feature,
    programs: safeArray(programs),
    offers: safeArray(offers),
    thresholds: normalizedThresholds,
    validation: validateAffiliateConfig(programs, offers),
  }
}

export function validateAffiliateConfig(programs, offers) {
  const issues = []
  const programIds = new Set()
  for (const program of safeArray(programs)) {
    if (!meaningfulText(program.id)) issues.push('Affiliate program is missing id.')
    if (programIds.has(program.id)) issues.push(`Duplicate affiliate program id: ${program.id}`)
    programIds.add(program.id)
    if (!safeArray(program.linkRel).includes('sponsored')) {
      issues.push(`Affiliate program ${program.id} must include sponsored rel.`)
    }
  }

  const offerIds = new Set()
  const trackingCodes = new Set()
  for (const offer of safeArray(offers)) {
    if (!meaningfulText(offer.id)) issues.push('Affiliate offer is missing id.')
    if (offerIds.has(offer.id)) issues.push(`Duplicate affiliate offer id: ${offer.id}`)
    offerIds.add(offer.id)
    if (!programIds.has(offer.programId)) {
      issues.push(`Affiliate offer ${offer.id} references unknown program ${offer.programId}.`)
    }
    if (!meaningfulText(offer.affiliateUrlEnvKey)) {
      issues.push(`Affiliate offer ${offer.id} is missing affiliateUrlEnvKey.`)
    }
    if (!meaningfulText(offer.trackingCode)) {
      issues.push(`Affiliate offer ${offer.id} is missing trackingCode.`)
    }
    if (trackingCodes.has(offer.trackingCode)) {
      issues.push(`Duplicate affiliate tracking code: ${offer.trackingCode}`)
    }
    trackingCodes.add(offer.trackingCode)
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

export function getAffiliateProgram(programs, programId) {
  return safeArray(programs).find((program) => program.id === programId) ?? null
}

export function getAffiliateOffer(offers, offerId) {
  return safeArray(offers).find((offer) => offer.id === offerId) ?? null
}

export function resolveAffiliateUrl(offer, env = process.env) {
  const envKey = meaningfulText(offer?.affiliateUrlEnvKey)
  const envUrl = envKey ? meaningfulText(env[envKey]) : ''
  if (envUrl) {
    return {
      href: envUrl,
      hasAffiliateUrl: true,
      urlSource: 'env',
    }
  }
  return {
    href: meaningfulText(offer?.fallbackDestinationUrl),
    hasAffiliateUrl: false,
    urlSource: meaningfulText(offer?.fallbackDestinationUrl) ? 'fallback' : 'missing',
  }
}

export function getOfferFreshness(offer, generatedAt = new Date(), maxAgeDays = 30) {
  const lastVerifiedAt = meaningfulText(offer?.lastVerifiedAt)
  if (!lastVerifiedAt) {
    return {
      status: 'unknown',
      fresh: false,
      ageDays: null,
      lastVerifiedAt: null,
    }
  }
  const ageDays = daysBetween(lastVerifiedAt, generatedAt)
  return {
    status: ageDays <= maxAgeDays ? 'fresh' : 'stale',
    fresh: ageDays <= maxAgeDays,
    ageDays,
    lastVerifiedAt,
  }
}

export function scoreCommercialIntent(text, pageType = '') {
  const surface = `${pageType} ${text}`.toLowerCase()
  const highTerms = [
    'cost',
    'price',
    'pricing',
    'hire',
    'service',
    'freelancer',
    'agency',
    'best service',
    'fiverr',
    'outsource',
    'professional',
    'vs hiring',
    'editor for hire',
  ]
  const lowTerms = [
    'inspiration',
    'examples',
    'definition',
    'news',
    'viral',
    'aesthetic',
    'wallpaper',
    'free image',
  ]
  const pageTypeBoost = AFFILIATE_ALLOWED_PAGE_TYPES.includes(pageType) ? 42 : 0
  const highScore = highTerms.reduce(
    (sum, term) => sum + (surface.includes(term) ? (term.includes(' ') ? 10 : 7) : 0),
    0,
  )
  const lowPenalty = lowTerms.reduce((sum, term) => sum + (surface.includes(term) ? 9 : 0), 0)
  return Math.max(0, Math.min(100, pageTypeBoost + highScore - lowPenalty))
}

export function isAffiliatePageEligible(pageType, program, commercialIntentScore, thresholds) {
  return (
    AFFILIATE_ALLOWED_PAGE_TYPES.includes(pageType) &&
    safeArray(program?.allowedPageTypes).includes(pageType) &&
    commercialIntentScore >= toNumber(thresholds?.minCommercialIntentScore, 65)
  )
}

export function buildAffiliateModule({
  page,
  offer,
  program,
  href,
  position = 'decision-path',
  variant = 'outsource-primary',
}) {
  const ctaLabel = safeArray(offer.ctaLabels)[0] ?? `Browse ${offer.label}`
  return {
    programId: program.id,
    programName: program.name,
    offerId: offer.id,
    category: offer.category,
    position,
    variant,
    label: ctaLabel,
    href,
    trackingCode: offer.trackingCode,
    disclosure: program.defaultDisclosure,
    lastVerifiedAt: offer.lastVerifiedAt ?? null,
    linkRel: dedupe(program.linkRel).join(' '),
    ctaTitle: offer.label,
    fit: `Good fit when ${page.title.toLowerCase()} points to an execution gap that a specialist can quote and deliver.`,
    notFor:
      'Not a fit when the project has no script, no source material, no rights requirements, or no owner for review feedback.',
    serviceCategory: offer.category,
  }
}

export function selectAffiliateModulesForPage({
  page,
  config,
  env = process.env,
  generatedAt = new Date(),
  preferredOfferIds = [],
}) {
  if (!config?.feature?.enabled || !page) {
    return {
      modules: [],
      disclosureRequired: false,
      checks: {
        affiliateFeatureEnabled: false,
      },
    }
  }
  if (!config.validation?.ok) {
    return {
      modules: [],
      disclosureRequired: false,
      checks: {
        affiliateFeatureEnabled: true,
        configValid: false,
        configIssues: config.validation?.issues ?? [],
      },
    }
  }

  const commercialIntentScore = toNumber(
    page.commercialIntentScore,
    scoreCommercialIntent(`${page.title} ${page.metaDescription} ${page.intro}`, page.type),
  )
  const offerIds =
    preferredOfferIds.length > 0
      ? preferredOfferIds
      : safeArray(config.offers)
          .filter((offer) => safeArray(offer.eligiblePageTypes).includes(page.type))
          .map((offer) => offer.id)

  const modules = []
  const diagnostics = []
  for (const offerId of offerIds) {
    const offer = getAffiliateOffer(config.offers, offerId)
    if (!offer) {
      diagnostics.push({ offerId, status: 'missing_offer' })
      continue
    }
    const program = getAffiliateProgram(config.programs, offer.programId)
    if (!program || program.enabled === false) {
      diagnostics.push({ offerId, status: 'program_disabled_or_missing' })
      continue
    }
    if (!isAffiliatePageEligible(page.type, program, commercialIntentScore, config.thresholds)) {
      diagnostics.push({ offerId, status: 'page_not_eligible' })
      continue
    }
    if (offer.status !== 'active') {
      diagnostics.push({ offerId, status: 'offer_not_active' })
      continue
    }
    const resolvedUrl = resolveAffiliateUrl(offer, env)
    if (!resolvedUrl.hasAffiliateUrl) {
      diagnostics.push({ offerId, status: 'missing_affiliate_url', urlSource: resolvedUrl.urlSource })
      continue
    }
    const freshness = getOfferFreshness(offer, generatedAt, config.thresholds.offerMaxAgeDays)
    if (!freshness.fresh) {
      diagnostics.push({ offerId, status: 'offer_not_fresh', freshness })
      continue
    }
    modules.push(
      buildAffiliateModule({
        page,
        offer,
        program,
        href: resolvedUrl.href,
        position: modules.length === 0 ? 'decision-path' : 'before-conclusion',
        variant: modules.length === 0 ? 'outsource-primary' : 'service-card',
      }),
    )
    if (modules.length >= config.thresholds.maxAffiliateModulesPerPage) break
  }

  return {
    modules,
    disclosureRequired: modules.length > 0,
    commercialIntentScore,
    checks: {
      affiliateFeatureEnabled: true,
      configValid: true,
      diagnostics,
    },
  }
}

export function buildAffiliateGa4Payload({ page, module }) {
  return {
    affiliate_program: module.programId,
    offer_id: module.offerId,
    tracking_code: module.trackingCode,
    page_slug: page.slug,
    page_type: page.type,
    cta_position: module.position,
    cta_variant: module.variant,
    destination_category: module.category,
  }
}

export function parseCsvRows(csvText) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const next = csvText[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      field += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(field)
      if (row.some((value) => meaningfulText(value))) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }
  row.push(field)
  if (row.some((value) => meaningfulText(value))) rows.push(row)
  return rows
}

export function resolveHeaderIndex(headers, aliases) {
  const normalizedHeaders = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias))
    if (index >= 0) return index
  }
  return -1
}

export function parseFiverrCsv(csvText) {
  const rows = parseCsvRows(csvText)
  if (rows.length === 0) return []
  const headers = rows[0]
  const indexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, resolveHeaderIndex(headers, aliases)]),
  )

  return rows.slice(1).map((row) => ({
    date: indexes.date >= 0 ? meaningfulText(row[indexes.date]) : '',
    trackingCode:
      indexes.trackingCode >= 0
        ? meaningfulText(row[indexes.trackingCode])
        : indexes.afp >= 0
          ? meaningfulText(row[indexes.afp])
          : '',
    country: indexes.country >= 0 ? meaningfulText(row[indexes.country]) : '',
    clicks: indexes.clicks >= 0 ? toNumber(row[indexes.clicks], 0) : 0,
    registrations: indexes.registrations >= 0 ? toNumber(row[indexes.registrations], 0) : 0,
    ftb: indexes.ftb >= 0 ? toNumber(row[indexes.ftb], 0) : 0,
    commission: indexes.commission >= 0 ? toNumber(row[indexes.commission], 0) : 0,
  }))
}

export function aggregateAffiliateRows(rows, knownTrackingCodes = [], generatedAt = new Date()) {
  if (safeArray(rows).length === 0) {
    const emptySummary = finalizeMetrics(emptyAffiliateMetrics())
    return {
      generatedAt: new Date(generatedAt).toISOString(),
      status: 'no_data',
      summary: emptySummary,
      byTrackingCode: [],
      byCountry: [],
      trends: {
        sevenDay: finalizeMetrics(emptyAffiliateMetrics()),
        thirtyDay: finalizeMetrics(emptyAffiliateMetrics()),
      },
      unmatchedTrackingCodes: [],
      anomalies: [],
      dataThroughDate: null,
    }
  }

  const knownSet = new Set(knownTrackingCodes)
  const summary = emptyAffiliateMetrics()
  const byTracking = new Map()
  const byCountry = new Map()
  const now = new Date(generatedAt)
  let dataThroughDate = null
  let invalidDateRows = 0
  let negativeMetricRows = 0
  let rowLevelMetricAnomalies = 0

  for (const row of rows) {
    const normalizedRow = {
      ...row,
      clicks: toNumber(row.clicks, 0),
      registrations: toNumber(row.registrations, 0),
      ftb: toNumber(row.ftb, 0),
      commission: toNumber(row.commission, 0),
    }
    const hasNegativeMetric = ['clicks', 'registrations', 'ftb', 'commission'].some(
      (key) => normalizedRow[key] < 0,
    )
    if (hasNegativeMetric) {
      negativeMetricRows += 1
      normalizedRow.clicks = Math.max(0, normalizedRow.clicks)
      normalizedRow.registrations = Math.max(0, normalizedRow.registrations)
      normalizedRow.ftb = Math.max(0, normalizedRow.ftb)
      normalizedRow.commission = Math.max(0, normalizedRow.commission)
    }
    if (normalizedRow.registrations > normalizedRow.clicks || normalizedRow.ftb > normalizedRow.registrations) {
      rowLevelMetricAnomalies += 1
    }

    addMetrics(summary, normalizedRow)
    addMetrics(mapMetrics(byTracking, normalizedRow.trackingCode || 'untracked'), normalizedRow)
    addMetrics(mapMetrics(byCountry, normalizedRow.country || 'unknown'), normalizedRow)
    const parsedDate = new Date(row.date)
    if (!Number.isNaN(parsedDate.getTime()) && (!dataThroughDate || parsedDate > dataThroughDate)) {
      dataThroughDate = parsedDate
    }
    if (Number.isNaN(parsedDate.getTime())) {
      invalidDateRows += 1
    }
  }

  const unmatchedTrackingCodes = [...byTracking.keys()].filter(
    (code) => code !== 'untracked' && knownSet.size > 0 && !knownSet.has(code),
  )
  const anomalies = []
  if (summary.registrations > summary.clicks) {
    anomalies.push('Registrations exceed clicks; check report columns or date range.')
  }
  if (summary.ftb > summary.registrations && summary.registrations > 0) {
    anomalies.push('FTB exceeds registrations; confirm whether rows are deduplicated.')
  }
  if (summary.commission > 0 && summary.ftb === 0) {
    anomalies.push('Commission is present with zero FTB; verify report semantics before using revenue.')
  }
  if (invalidDateRows > 0) {
    anomalies.push(`${invalidDateRows} row(s) have invalid dates and were excluded from trend windows.`)
  }
  if (negativeMetricRows > 0) {
    anomalies.push(`${negativeMetricRows} row(s) contain negative metrics; negative values were clamped to zero.`)
  }
  if (rowLevelMetricAnomalies > 0) {
    anomalies.push(`${rowLevelMetricAnomalies} row(s) have registrations or FTB counts above the prior funnel step.`)
  }

  const sevenDayRows = rows.filter((row) => isWithinDays(row.date, now, 7))
  const thirtyDayRows = rows.filter((row) => isWithinDays(row.date, now, 30))

  return {
    generatedAt: new Date(generatedAt).toISOString(),
    status: 'ok',
    summary: finalizeMetrics(summary),
    byTrackingCode: [...byTracking.entries()]
      .map(([trackingCode, metrics]) => ({ trackingCode, ...finalizeMetrics(metrics) }))
      .sort((left, right) => right.clicks - left.clicks),
    byCountry: [...byCountry.entries()]
      .map(([country, metrics]) => ({ country, ...finalizeMetrics(metrics) }))
      .sort((left, right) => right.clicks - left.clicks),
    trends: {
      sevenDay: finalizeMetrics(sumRows(sevenDayRows)),
      thirtyDay: finalizeMetrics(sumRows(thirtyDayRows)),
    },
    unmatchedTrackingCodes,
    anomalies,
    dataThroughDate: dataThroughDate ? dataThroughDate.toISOString().slice(0, 10) : null,
  }
}

export function emptyAffiliateMetrics() {
  return {
    clicks: 0,
    registrations: 0,
    ftb: 0,
    commission: 0,
  }
}

function mapMetrics(map, key) {
  if (!map.has(key)) map.set(key, emptyAffiliateMetrics())
  return map.get(key)
}

function addMetrics(target, row) {
  target.clicks += toNumber(row.clicks, 0)
  target.registrations += toNumber(row.registrations, 0)
  target.ftb += toNumber(row.ftb, 0)
  target.commission += toNumber(row.commission, 0)
}

function sumRows(rows) {
  const metrics = emptyAffiliateMetrics()
  for (const row of rows) addMetrics(metrics, row)
  return metrics
}

function finalizeMetrics(metrics) {
  const clicks = toNumber(metrics.clicks, 0)
  const registrations = toNumber(metrics.registrations, 0)
  const ftb = toNumber(metrics.ftb, 0)
  const commission = round(toNumber(metrics.commission, 0), 2)
  return {
    clicks,
    registrations,
    ftb,
    commission,
    clickToRegistrationRate: clicks > 0 ? round(registrations / clicks, 4) : 0,
    clickToFtbRate: clicks > 0 ? round(ftb / clicks, 4) : 0,
    registrationToFtbRate: registrations > 0 ? round(ftb / registrations, 4) : 0,
    commissionPerClick: clicks > 0 ? round(commission / clicks, 4) : 0,
    commissionPerFtb: ftb > 0 ? round(commission / ftb, 2) : 0,
  }
}

function isWithinDays(dateValue, now, days) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return false
  const deltaDays = (now.getTime() - date.getTime()) / 86400000
  return deltaDays >= 0 && deltaDays <= days
}

function buildFiverrOverlapKey(row) {
  return [
    meaningfulText(row?.date).toLowerCase(),
    meaningfulText(row?.trackingCode).toLowerCase(),
    meaningfulText(row?.country).toLowerCase(),
  ].join('|')
}

export async function readFiverrImportRowsWithMetadata(importDirectory, options = {}) {
  if (!existsSync(importDirectory)) {
    return {
      rows: [],
      metadata: {
        importedFiles: [],
        duplicateRowsSkipped: 0,
        overlappingRowsReplaced: 0,
        allFiles: Boolean(options.allFiles),
      },
    }
  }

  const csvFiles = await Promise.all(
    (await readdir(importDirectory))
      .filter((fileName) => /\.csv$/i.test(fileName))
      .map(async (fileName) => {
        const filePath = path.join(importDirectory, fileName)
        const fileStat = await stat(filePath)
        return {
          fileName,
          filePath,
          mtimeMs: fileStat.mtimeMs,
        }
      }),
  )

  const selectedFiles = (options.allFiles
    ? csvFiles.sort((left, right) => left.mtimeMs - right.mtimeMs || left.fileName.localeCompare(right.fileName))
    : csvFiles.sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName)).slice(0, 1)
  )

  const rowsByKey = new Map()
  let duplicateRowsSkipped = 0
  let overlappingRowsReplaced = 0

  for (const [importBatchIndex, file] of selectedFiles.entries()) {
    const csvText = await readFile(file.filePath, 'utf8')
    for (const [rowIndex, row] of parseFiverrCsv(csvText).entries()) {
      const overlapKey = buildFiverrOverlapKey(row)
      const key = overlapKey === '||'
        ? `${file.fileName}#${rowIndex}`
        : overlapKey
      const nextRow = {
        ...row,
        importFile: file.fileName,
        importBatchIndex,
      }
      const existingRow = rowsByKey.get(key)
      if (existingRow?.importFile === file.fileName) {
        duplicateRowsSkipped += 1
        continue
      }
      if (existingRow) {
        overlappingRowsReplaced += 1
      }
      rowsByKey.set(key, nextRow)
    }
  }

  return {
    rows: [...rowsByKey.values()].map(({ importBatchIndex, ...row }) => row),
    metadata: {
      importedFiles: selectedFiles.map((file) => file.fileName),
      duplicateRowsSkipped,
      overlappingRowsReplaced,
      allFiles: Boolean(options.allFiles),
    },
  }
}

export async function readFiverrImportRows(importDirectory, options = {}) {
  const result = await readFiverrImportRowsWithMetadata(importDirectory, options)
  readFiverrImportRows.lastImportMetadata = result.metadata
  return result.rows
}

export async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

export async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}
