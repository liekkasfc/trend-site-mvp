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

function paragraphDuplicateRatio(html) {
  const paragraphs = [...String(html ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalize(match[1]))
    .filter((text) => text.split(' ').length >= 7)
  if (paragraphs.length === 0) return 0
  const counts = new Map()
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1)
  const duplicates = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  return Number((duplicates / paragraphs.length).toFixed(3))
}

function substantiveParagraphFingerprints(html) {
  const contentHtml = String(html ?? '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+data-legal-disclosure[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
  return [...new Set(
    [...contentHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => normalize(match[1]))
      .filter((text) => text.split(' ').length >= 9),
  )]
}

function violation(code, message, detail = {}) {
  return { code, message, ...detail }
}

function scoreComponent(pass, points) {
  return pass ? points : 0
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
  const duplicateRatio = paragraphDuplicateRatio(html)
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

  const score =
    scoreComponent(queryMatches.length > 0 && outcomeMatches.length > 0, 15) +
    scoreComponent(audienceMatches.length > 0 || !requiredSignals.has('audience'), 15) +
    scoreComponent(inputMatches.length > 0 || !requiredSignals.has('input'), 15) +
    scoreComponent(queryMatches.length > 0, 15) +
    scoreComponent((!requiredSignals.has('proof') || hasProof) && (!requiredSignals.has('verdict') || hasVerdict) && (!requiredSignals.has('watchOut') || hasWatchOut), 15) +
    scoreComponent(!requiredSignals.has('cta') || ctaMatches.length > 0, 10) +
    scoreComponent(true, 10) +
    scoreComponent(forbiddenMatches.length === 0, 5)

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
  for (let leftIndex = 0; leftIndex < reports.length; leftIndex += 1) {
    const left = reports[leftIndex]
    const leftFingerprints = safeArray(fingerprintsByPath.get(left.path)).filter((item) => !commonBoilerplate.has(item))
    if (leftFingerprints.length < 8) continue
    for (let rightIndex = leftIndex + 1; rightIndex < reports.length; rightIndex += 1) {
      const right = reports[rightIndex]
      const rightFingerprints = safeArray(fingerprintsByPath.get(right.path)).filter((item) => !commonBoilerplate.has(item))
      if (rightFingerprints.length < 8) continue
      const rightSet = new Set(rightFingerprints)
      const shared = leftFingerprints.filter((paragraph) => rightSet.has(paragraph))
      const ratio = Number((shared.length / Math.min(leftFingerprints.length, rightFingerprints.length)).toFixed(3))
      if (ratio <= 0.25) continue
      for (const [page, other] of [[left, right], [right, left]]) {
        page.violations.push(violation('cross_page_duplicate_ratio_high', `Body copy overlaps ${other.path} at ${ratio}; max is 0.25.`, {
          comparedWith: other.path,
          duplicateRatio: ratio,
          duplicateParagraphs: shared.slice(0, 4),
        }))
        page.status = 'fail'
        page.crossPageDuplicateRatio = Math.max(page.crossPageDuplicateRatio ?? 0, ratio)
      }
    }
  }
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
