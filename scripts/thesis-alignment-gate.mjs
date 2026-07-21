import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRouteManifest, resolvePageIntentContracts } from './route-manifest.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function plainText(value) {
  return decodeHtml(String(value ?? '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(value) {
  return plainText(value).toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9%+.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function tagText(html, tagName) {
  return plainText(String(html ?? '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))?.[1] ?? '')
}

function metaDescription(html) {
  return decodeHtml(String(html ?? '').match(/<meta\b(?=[^>]*name=["']description["'])[^>]*content=["']([^"']*)["'][^>]*>/i)?.[1] ?? '')
}

function matchesAny(text, terms) {
  const normalizedText = normalize(text)
  return safeArray(terms).filter((term) => normalizedText.includes(normalize(term)))
}

function extractCtaTexts(html) {
  const explicitPrimary = String(html ?? '').match(/<a\b[^>]*data-primary-cta[^>]*>([\s\S]*?)<\/a>/i)
  if (explicitPrimary) return [plainText(explicitPrimary[1])].filter(Boolean)
  const preferred = []
  for (const match of String(html ?? '').matchAll(/<a\b[^>]*class=["'][^"']*(?:cta-button|primary-cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = plainText(match[1])
    if (text) preferred.push(text)
  }
  if (preferred.length > 0) return [preferred[0]]
  return [...String(html ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => plainText(match[1]))
    .filter(Boolean)
}

function isGenericBoilerplateParagraph(text, attributes = '') {
  if (/\bdata-(?:affiliate|legal)-disclosure\b/i.test(attributes)) return true
  if (/\bclass=["'][^"']*(?:affiliate-disclosure|legal-disclosure|brand-description|site-boilerplate|boilerplate)[^"']*["']/i.test(attributes)) return true
  if (/^(?:affiliate|advertiser) disclosure\b|\bwe may earn (?:an? )?commission\b/i.test(text)) return true
  return /^(?:automiora|this site) (?:is|helps|offers|provides)\b/i.test(text) && text.split(' ').length <= 24
}

function substantiveParagraphs(html) {
  const sourceHtml = String(html ?? '')
  const mainHtml = sourceHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? sourceHtml
  const contentHtml = mainHtml
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<section\b[^>]*(?:data-decision-surface|class=["'][^"']*(?:next-step-bridge|cta|asset-preview-section|affiliate-decision-path|affiliate-service-section)[^"']*["'])[^>]*>[\s\S]*?<\/section>/gi, ' ')
    .replace(/<aside\b[^>]*class=["'][^"']*affiliate-disclosure[^"']*["'][^>]*>[\s\S]*?<\/aside>/gi, ' ')
  return [...contentHtml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
    .map((match) => ({ attributes: match[1], text: normalize(match[2]) }))
    .filter(({ attributes, text }) => text.split(' ').length >= 9 && !isGenericBoilerplateParagraph(text, attributes))
    .map(({ text }) => text)
}

function paragraphDuplicateRatio(paragraphs) {
  if (paragraphs.length === 0) return 0
  const counts = new Map()
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1)
  const duplicates = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  return Number((duplicates / paragraphs.length).toFixed(3))
}

function substantiveParagraphFingerprints(html) {
  return [...new Set(substantiveParagraphs(html))]
}

function violation(code, message, detail = {}) {
  return { code, message, ...detail }
}

function scoreComponent(pass, points) {
  return pass ? points : 0
}

function uniquenessScoreForDuplicateRatio(duplicateRatio) {
  if (duplicateRatio <= 0.1) return 10
  if (duplicateRatio <= 0.2) return 5
  return 0
}

function calculatePageScore(signals) {
  return (
    scoreComponent(signals.titleThesisAligned, 15) +
    scoreComponent(signals.audienceAligned, 15) +
    scoreComponent(signals.inputAligned, 15) +
    scoreComponent(signals.intentAligned, 15) +
    scoreComponent(signals.proofAligned, 15) +
    scoreComponent(signals.ctaAligned, 10) +
    signals.contentUniquenessScore +
    scoreComponent(signals.forbiddenPositioningClear, 5)
  )
}

function recalculatePageScoreAfterSiteChecks(page) {
  if (!page.violations.some((item) => item.code === 'cross_page_duplicate_ratio_high')) return
  page.score -= page.contentUniquenessScore
  page.contentUniquenessScore = 0
  page.status = 'fail'
}

export function evaluatePageAlignment(html, intent, thesisContract, options = {}) {
  const text = plainText(html)
  const title = tagText(html, 'title')
  const description = metaDescription(html)
  const h1 = tagText(html, 'h1')
  const primarySurface = `${title} ${description} ${h1}`
  const openingText = text.slice(0, 1800)
  const audienceMatches = matchesAny(`${primarySurface} ${openingText}`, thesisContract?.requiredAudienceTerms)
  const inputMatches = matchesAny(text, thesisContract?.requiredInputTerms)
  const outcomeMatches = matchesAny(`${primarySurface} ${text}`, thesisContract?.requiredOutcomeTerms)
  const contextMatches = matchesAny(`${primarySurface} ${openingText}`, thesisContract?.requiredContextTerms)
  const queryMatches = matchesAny(`${primarySurface} ${openingText}`, intent?.queryTerms)
  const forbiddenMatches = matchesAny(primarySurface, thesisContract?.forbiddenPrimaryContexts)
  const ctaTexts = extractCtaTexts(html)
  const ctaMatches = ctaTexts.filter((cta) => matchesAny(cta, intent?.ctaTerms).length > 0)
  const hasProof = /data-proof-object|data-claim-type=["'](?:verified_fact|sourced_claim|worked_example)["']|internal worked example|worked example|source note|evidence:/i.test(html)
  const hasVerdict = /data-page-verdict|data-tool-verdict|\bverdict\b|\bbest for\b|\brecommend(?:ed|ation)?\b/i.test(html)
  const hasWatchOut = /\bwatch[- ]?out\b|\bfailure mode\b|\bhidden cost\b|\blimitation\b|\bcaveat\b|\bred flag\b|\bwhat can go wrong\b/i.test(text)
  const pageParagraphs = substantiveParagraphs(html)
  const duplicateRatio = paragraphDuplicateRatio(pageParagraphs)
  const contentUniquenessScore = uniquenessScoreForDuplicateRatio(duplicateRatio)
  const requiredSignals = new Set(safeArray(intent?.requiredSignals))
  const violations = []
  const warnings = []

  if (!intent) {
    violations.push(violation('missing_page_intent_contract', `No page intent contract exists for ${options.path ?? 'this page'}.`))
  }
  if (forbiddenMatches.length > 0) {
    violations.push(violation('forbidden_primary_context', 'Title, description, or H1 uses a forbidden primary context.', { matches: forbiddenMatches }))
  }
  if (requiredSignals.has('audience') && audienceMatches.length === 0) {
    violations.push(violation('missing_thesis_audience', 'The page does not identify the SaaS/product-team audience.'))
  }
  if (requiredSignals.has('input') && inputMatches.length === 0) {
    violations.push(violation('missing_thesis_input', 'The page does not name a product-demo source input.'))
  }
  if (requiredSignals.has('outcome') && outcomeMatches.length === 0) {
    violations.push(violation('missing_thesis_outcome', 'The page does not name a product-demo outcome.'))
  }
  if (queryMatches.length === 0) {
    violations.push(violation('page_intent_mismatch', 'Title, description, H1, and opening copy do not match the page query contract.', { expected: safeArray(intent?.queryTerms) }))
  }
  if (requiredSignals.has('proof') && !hasProof) {
    violations.push(violation('missing_proof_object', 'The page requires a labelled proof object.'))
  }
  if (requiredSignals.has('verdict') && !hasVerdict) {
    violations.push(violation('missing_verdict', 'The page requires an explicit verdict or recommendation.'))
  }
  if (requiredSignals.has('watchOut') && !hasWatchOut) {
    violations.push(violation('missing_watch_out', 'The page requires a watch-out, limitation, caveat, or failure mode.'))
  }
  if (requiredSignals.has('cta') && ctaMatches.length === 0) {
    violations.push(violation('cta_intent_mismatch', 'Primary CTA does not match the page intent.', { expected: safeArray(intent?.ctaTerms), found: ctaTexts }))
  }
  const containsCustomerClaim = /\b(?:customer result|proven result|conversion (?:increased|improved)|saved \d+|revenue (?:increased|grew))\b/i.test(text)
  const labelsClaims = /data-claim-type=["'](?:verified_fact|sourced_claim|operator_recommendation|estimate|worked_example)["']/i.test(html)
  if (containsCustomerClaim && !labelsClaims) {
    violations.push(violation('unlabelled_customer_proof', 'Customer or performance proof must carry an explicit claim label.'))
  }
  if (contextMatches.length < 2) {
    warnings.push({ code: 'thin_thesis_context', message: 'The page uses fewer than two thesis context terms.' })
  }
  if (duplicateRatio > 0.2) {
    violations.push(violation('in_page_duplicate_ratio_high', `Repeated substantive paragraphs account for ${duplicateRatio} of this page; max is 0.20.`, {
      duplicateRatio,
    }))
  }

  const score = calculatePageScore({
    titleThesisAligned: queryMatches.length > 0 && outcomeMatches.length > 0,
    audienceAligned: audienceMatches.length > 0 || !requiredSignals.has('audience'),
    inputAligned: inputMatches.length > 0 || !requiredSignals.has('input'),
    intentAligned: queryMatches.length > 0,
    proofAligned: (!requiredSignals.has('proof') || hasProof) && (!requiredSignals.has('verdict') || hasVerdict) && (!requiredSignals.has('watchOut') || hasWatchOut),
    ctaAligned: !requiredSignals.has('cta') || ctaMatches.length > 0,
    contentUniquenessScore,
    forbiddenPositioningClear: forbiddenMatches.length === 0,
  })

  return {
    path: options.path ?? intent?.path ?? '',
    pageType: intent?.pageType ?? 'unknown',
    primaryIntent: intent?.primaryIntent ?? '',
    score,
    status: violations.length === 0 && score >= (intent?.minimumScore ?? 85) ? 'pass' : 'fail',
    matchedAudience: audienceMatches,
    matchedInputs: inputMatches,
    matchedOutcomes: outcomeMatches,
    matchedContext: contextMatches,
    matchedQueries: queryMatches,
    proofCount: hasProof ? 1 : 0,
    watchOutCount: hasWatchOut ? 1 : 0,
    verdictCount: hasVerdict ? 1 : 0,
    primaryCta: ctaTexts[0] ?? '',
    duplicateRatio,
    substantiveParagraphCount: new Set(pageParagraphs).size,
    crossPageDuplicateRatio: 0,
    contentUniquenessScore,
    violations,
    warnings,
  }
}

export function evaluateSiteAlignment(pages, config) {
  const intentMap = new Map(safeArray(config?.pageIntents).map((intent) => [intent.path, intent]))
  const reports = safeArray(pages).map((page) => {
    const intent = intentMap.get(page.path)
    if (!intent) {
      return {
        path: page.path,
        pageType: 'unknown',
        primaryIntent: '',
        score: 0,
        status: 'fail',
        matchedAudience: [],
        matchedInputs: [],
        matchedOutcomes: [],
        proofCount: 0,
        watchOutCount: 0,
        verdictCount: 0,
        primaryCta: '',
        duplicateRatio: 0,
        substantiveParagraphCount: 0,
        crossPageDuplicateRatio: 0,
        contentUniquenessScore: 0,
        violations: [violation('missing_page_intent_contract', `No page intent contract exists for ${page.path}.`)],
        warnings: [],
      }
    }
    return evaluatePageAlignment(page.html, intent, config.thesisContract, { path: page.path })
  })
  const pageHtmlMap = new Map(safeArray(pages).map((page) => [page.path, page.html]))
  const fingerprintsByPath = new Map(
    reports.map((page) => [page.path, substantiveParagraphFingerprints(pageHtmlMap.get(page.path))]),
  )
  const documentFrequency = new Map()
  for (const fingerprints of fingerprintsByPath.values()) {
    for (const fingerprint of fingerprints) {
      documentFrequency.set(fingerprint, (documentFrequency.get(fingerprint) ?? 0) + 1)
    }
  }
  const commonBoilerplate = new Set(
    [...documentFrequency.entries()].filter(([, count]) => count >= 3).map(([fingerprint]) => fingerprint),
  )
  const comparableFingerprintsByPath = new Map()
  for (const page of reports) {
    const fingerprints = safeArray(fingerprintsByPath.get(page.path)).filter((item) => !commonBoilerplate.has(item))
    comparableFingerprintsByPath.set(page.path, fingerprints)
    page.substantiveParagraphCount = fingerprints.length
    page.crossPageDuplicateRatio = 0
    if (fingerprints.length < 4 && !page.warnings.some((item) => item.code === 'insufficient_content_for_duplicate_analysis')) {
      page.warnings.push({
        code: 'insufficient_content_for_duplicate_analysis',
        message: `Only ${fingerprints.length} substantive paragraph(s) remain after boilerplate exclusion; cross-page duplication was not scored.`,
      })
    }
  }
  for (let leftIndex = 0; leftIndex < reports.length; leftIndex += 1) {
    const left = reports[leftIndex]
    const leftFingerprints = safeArray(comparableFingerprintsByPath.get(left.path))
    if (leftFingerprints.length < 4) continue
    for (let rightIndex = leftIndex + 1; rightIndex < reports.length; rightIndex += 1) {
      const right = reports[rightIndex]
      const rightFingerprints = safeArray(comparableFingerprintsByPath.get(right.path))
      if (rightFingerprints.length < 4) continue
      const rightSet = new Set(rightFingerprints)
      const shared = leftFingerprints.filter((paragraph) => rightSet.has(paragraph))
      const ratio = Number((shared.length / Math.min(leftFingerprints.length, rightFingerprints.length)).toFixed(3))
      const usesShortPageRule = Math.min(leftFingerprints.length, rightFingerprints.length) < 8
      const threshold = usesShortPageRule ? 0.35 : 0.25
      if (ratio <= threshold || (usesShortPageRule && shared.length < 2)) continue
      for (const [page, other] of [[left, right], [right, left]]) {
        page.violations.push(violation('cross_page_duplicate_ratio_high', `Body copy overlaps ${other.path} at ${ratio}; max is ${threshold}.`, {
          comparedWith: other.path,
          duplicateRatio: ratio,
          duplicateParagraphs: shared.slice(0, 4),
        }))
        page.crossPageDuplicateRatio = Math.max(page.crossPageDuplicateRatio, ratio)
      }
    }
  }
  for (const page of reports) recalculatePageScoreAfterSiteChecks(page)
  const blockedPaths = reports.filter((page) => page.status !== 'pass').map((page) => page.path)
  const sitemapEligiblePaths = reports.filter((page) => page.status === 'pass').map((page) => page.path)
  const siteScore = reports.length > 0 ? Math.round(reports.reduce((sum, page) => sum + page.score, 0) / reports.length) : 0
  return {
    thesisKey: config?.thesisKey ?? '',
    generatedAt: new Date().toISOString(),
    status: blockedPaths.length === 0 ? 'pass' : 'fail',
    siteScore,
    pages: reports,
    sitemapEligiblePaths,
    blockedPaths,
    excludedCommonParagraphCount: commonBoilerplate.size,
  }
}

export async function loadThesisAlignmentConfig(options = {}) {
  const experimentPath = options.experimentPath ?? path.join(projectRoot, 'config', 'experiment.json')
  const intentsPath = options.intentsPath ?? path.join(projectRoot, 'config', 'page-intents.json')
  const experiment = JSON.parse(await readFile(experimentPath, 'utf8'))
  const intents = JSON.parse(await readFile(intentsPath, 'utf8'))
  const routeManifest = loadRouteManifest(options.routeManifestPath)
  return {
    thesisKey: experiment.thesisKey,
    thesisContract: experiment.thesisContract,
    pageIntents: resolvePageIntentContracts(intents.pages, { manifest: routeManifest }),
  }
}

function publicFileForRoute(routePath) {
  return routePath === '/' ? path.join(projectRoot, 'public', 'index.html') : path.join(projectRoot, 'public', routePath.replace(/^\//, ''), 'index.html')
}

export async function runThesisAlignmentGate(options = {}) {
  const config = options.config ?? await loadThesisAlignmentConfig(options)
  const pages = []
  for (const intent of safeArray(config.pageIntents)) {
    if (intent.indexable === false) continue
    const htmlPath = intent.publicFile ? path.resolve(projectRoot, intent.publicFile) : publicFileForRoute(intent.path)
    if (!existsSync(htmlPath)) {
      pages.push({ path: intent.path, html: '' })
      continue
    }
    pages.push({ path: intent.path, html: await readFile(htmlPath, 'utf8') })
  }
  const report = evaluateSiteAlignment(pages, config)
  const outputPath = options.outputPath ?? path.join(projectRoot, 'public', 'generated', 'thesis-alignment-report.json')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return { ...report, outputPath }
}

async function main() {
  const report = await runThesisAlignmentGate()
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'pass') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
