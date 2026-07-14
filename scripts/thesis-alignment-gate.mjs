#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  comparePageBodies,
  detectUnlabeledFabricatedCaseStudy,
  stripHtmlToMainText,
} from './content-duplication-gate.mjs'
import {
  ctaMatchesIntent,
  getPageIntent,
  isOgImageCrawlable,
  loadPageIntents,
  listHighValuePaths,
  normalizePublicPath,
  resolvePublicHtmlPath,
} from './page-intent-contract.mjs'
import {
  detectForbiddenPositioning,
  extractAudienceInputOutcome,
  getThesisContract,
  loadExperiment,
  matchesAnyTerm,
  normalizeText,
  projectRoot,
  safeArray,
} from './thesis-contract.mjs'

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

export function extractTitle(html) {
  const match = String(html).match(/<title>([^<]*)<\/title>/i)
  return match?.[1]?.trim() ?? ''
}

export function extractMetaDescription(html) {
  const match = String(html).match(/<meta\s+name="description"\s+content="([^"]*)"/i)
  return match?.[1]?.trim() ?? ''
}

export function extractH1(html) {
  const match = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : ''
}

export function extractLede(html) {
  const match = String(html).match(/class="lede"[^>]*>([\s\S]*?)<\/p>/i)
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : ''
}

export function extractOgImage(html) {
  const match = String(html).match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)
  return match?.[1]?.trim() ?? ''
}

export function extractCtas(html) {
  const hrefs = []
  const re = /<a\b([^>]*)>/gi
  let match
  while ((match = re.exec(html))) {
    const attrs = match[1]
    const classMatch = attrs.match(/class="([^"]*)"/i)
    const hrefMatch = attrs.match(/href="([^"]*)"/i)
    if (!classMatch || !hrefMatch) continue
    if (!/\b(cta-button|secondary-cta)\b/.test(classMatch[1])) continue
    // Ignore selector placeholders and empty home fallbacks until JS fills them.
    if (/\bdata-selector-result-link\b/.test(attrs)) continue
    const href = hrefMatch[1]
    if (!href || href === '#' || href === '/') continue
    hrefs.push({
      className: classMatch[1],
      href,
      isPrimary: /\bcta-button\b/.test(classMatch[1]),
    })
  }
  // form actions count as primary CTA for asset landings
  const form = html.match(/<form\b[^>]*action="([^"]*)"/i)
  if (form?.[1]) hrefs.push({ className: 'form', href: form[1], isPrimary: true })
  return hrefs
}

export function countProofSignals(text) {
  const patterns = [
    /\brunway\b/i,
    /\bpika\b/i,
    /\bseedance\b/i,
    /\bkling\b/i,
    /\bworked example\b/i,
    /\binternal test\b/i,
    /\bbefore\b[\s\S]{0,40}\bafter\b/i,
    /\bcomparison worksheet\b/i,
    /\bchecklist\b/i,
    /\b\$\d+/i,
    /\b\d{1,3}[-–]\d{1,3}\s*(s|sec|second|min|minute)/i,
  ]
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0)
}

export function countWatchOuts(text) {
  const patterns = [
    /\bwatch-?out\b/i,
    /\bfailure\b/i,
    /\bnot for\b/i,
    /\bskip if\b/i,
    /\brisk\b/i,
    /\bdo not\b/i,
    /\bavoid\b/i,
  ]
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0)
}

export function hasVerdict(text) {
  return /\b(recommend|start with|primary pick|should|stay free|upgrade when|best first|verdict)\b/i.test(
    text,
  )
}

/**
 * Score a single page HTML against thesis + page intent contracts.
 * @param {{ path: string, html: string, pageType?: string }} page
 */
export function scorePage(page, options = {}) {
  const contract = options.contract ?? getThesisContract()
  const intent = options.intent ?? getPageIntent(page.path)
  const html = page.html || ''
  const title = extractTitle(html)
  const meta = extractMetaDescription(html)
  const h1 = extractH1(html)
  const lede = extractLede(html)
  const aboveFold = [title, meta, h1, lede].join('\n')
  const body = stripHtmlToMainText(html)
  const fullText = `${aboveFold}\n${body}`
  const matches = extractAudienceInputOutcome(fullText, contract)
  const forbidden = detectForbiddenPositioning(fullText, contract)
  const ctas = extractCtas(html)
  const primaryCta = ctas.find((item) => item.isPrimary)?.href || ctas[0]?.href || ''
  const secondaryCta = ctas.find((item) => !item.isPrimary)?.href || ''
  const ctaCheck = ctaMatchesIntent(intent, primaryCta, secondaryCta)
  const proofCount = countProofSignals(fullText)
  const watchOutCount = countWatchOuts(fullText)
  const verdict = hasVerdict(fullText)
  const ogImage = extractOgImage(html)
  const fabricated = detectUnlabeledFabricatedCaseStudy(html, page.path)
  const violations = []
  const warnings = []
  const hardFails = []

  let score = 0

  // Title/meta/H1 alignment (15)
  const headText = `${title} ${meta} ${h1}`
  const headProduct = /product demo|saas|feature launch|walkthrough|screenshot/i.test(headText)
  const headGenericOnly = /ai video/i.test(headText) && !headProduct
  if (headProduct) score += 15
  else if (/ai video workflow/i.test(headText)) {
    score += 5
    warnings.push('head_still_generic_ai_video_workflow')
  } else {
    violations.push('title_meta_h1_not_thesis_aligned')
  }

  // Audience + job in first two screens (15)
  if (matches.matchedAudience.length >= 1) score += 8
  else violations.push('missing_audience_above_fold')
  if (/workflow|pilot|choose|start|make|hire|budget|compare/i.test(aboveFold)) score += 7
  else warnings.push('weak_job_language_above_fold')

  // Inputs + outputs (15)
  if (matches.matchedInputs.length >= 1) score += 8
  else violations.push('missing_input_terms')
  if (matches.matchedOutcomes.length >= 1) score += 7
  else violations.push('missing_outcome_terms')

  // Page intent contract (15)
  if (!intent) {
    hardFails.push('missing_page_intent_contract')
    violations.push('missing_page_intent_contract')
  } else {
    score += 10
    if (ctaCheck.ok) score += 5
    else {
      violations.push(...ctaCheck.reasons)
      hardFails.push('cta_intent_mismatch')
    }
  }

  // Proof / verdict / watch-out (15)
  if (proofCount >= 1) score += 5
  else violations.push('missing_proof_object')
  if (verdict) score += 5
  else {
    violations.push('missing_verdict')
    if (intent?.highValue !== false) hardFails.push('missing_verdict')
  }
  if (watchOutCount >= 1) score += 5
  else {
    violations.push('missing_watch_out')
    if (intent?.highValue) hardFails.push('missing_watch_out')
  }

  // CTA present + matching (10)
  if (primaryCta) score += 5
  else {
    violations.push('missing_primary_cta')
    if (page.path === '/') hardFails.push('missing_primary_cta')
  }
  if (secondaryCta || page.path === '/prompt-pack/' || page.path === '/audit/' || page.path?.includes('worksheet') || page.path?.includes('checklist')) {
    score += 5
  } else if (intent?.secondaryCta) warnings.push('missing_secondary_cta')

  // Uniqueness placeholder (10) — adjusted by site-level duplication later
  score += 10

  // Forbidden positioning (5)
  if (forbidden.length === 0) score += 5
  else {
    violations.push(...forbidden.map((item) => `forbidden:${item}`))
    hardFails.push('forbidden_positioning')
  }

  if (!fabricated.ok) {
    violations.push(...fabricated.violations)
    hardFails.push('fabricated_or_unlabeled_case_data')
  }

  if (ogImage && !isOgImageCrawlable(ogImage)) {
    warnings.push('og_image_not_crawlable')
  }

  // Only hard-fail CTA intent on primary mismatch for high-value pages
  if (ctaCheck.reasons.some((item) => item.startsWith('primary_cta_mismatch'))) {
    hardFails.push('cta_intent_mismatch')
  }

  // Hub hard gates
  if (page.path === '/') {
    if (!/product demo|saas|feature/i.test(`${title} ${h1}`)) {
      hardFails.push('hub_title_h1_missing_product_demo_context')
    }
    if (matches.matchedAudience.length === 0) hardFails.push('hub_missing_audience')
    if (matches.matchedInputs.length === 0) hardFails.push('hub_missing_inputs')
    if (matches.matchedOutcomes.length === 0) hardFails.push('hub_missing_outputs')
    if (!primaryCta) hardFails.push('hub_missing_primary_cta')
    if (!secondaryCta) hardFails.push('hub_missing_secondary_cta')
    if (proofCount < 1) hardFails.push('hub_missing_proof')
    if (/create an ai video/i.test(fullText)) hardFails.push('hub_generic_create_ai_video_cta')
    if (headGenericOnly) hardFails.push('hub_generic_ai_video_portal')
  }

  if (intent?.primaryQueryCluster && !matchesAnyTerm(fullText, ['product', 'saas', 'demo', 'launch', 'feature'])) {
    hardFails.push('page_query_off_thesis')
  }

  // Non-hub: missing verdict/watch-out are hard only for high-value intent pages
  if (intent?.highValue && page.path !== '/') {
    if (!verdict) hardFails.push('missing_verdict')
    if (watchOutCount < 1) hardFails.push('missing_watch_out')
  } else {
    // demote non-high-value missing verdict/watchout from hard fails if accidentally added
  }

  score = Math.max(0, Math.min(100, score))
  const passScore = contract.gateRules.passScore ?? 85
  // For non-hub pages, hard fails on verdict/watchout only if highValue
  const effectiveHardFails = hardFails.filter((item) => {
    if (page.path === '/') return true
    if (item === 'missing_verdict' || item === 'missing_watch_out') return Boolean(intent?.highValue)
    if (item === 'cta_intent_mismatch') return Boolean(intent?.highValue)
    return true
  })

  const status =
    effectiveHardFails.length > 0
      ? 'fail'
      : score >= passScore
        ? 'pass'
        : score >= passScore - 15
          ? 'warning'
          : 'fail'

  return {
    path: normalizePublicPath(page.path),
    pageType: intent?.pageType ?? page.pageType ?? 'unknown',
    score,
    status,
    matchedAudience: matches.matchedAudience,
    matchedInputs: matches.matchedInputs,
    matchedOutcomes: matches.matchedOutcomes,
    primaryIntent: safeArray(intent?.primaryQueryCluster)[0] ?? '',
    proofCount,
    watchOutCount,
    primaryCta,
    secondaryCta,
    duplicateRatio: 0,
    hardFails: effectiveHardFails,
    violations: [...new Set([...violations, ...effectiveHardFails])],
    warnings: [...new Set(warnings)],
    title,
    h1,
    ogImage,
    sitemapEligible: status !== 'fail' && effectiveHardFails.length === 0,
  }
}

export async function collectPublicPages(root = path.join(projectRoot, 'public')) {
  const intents = loadPageIntents()
  const pages = []
  for (const intent of safeArray(intents.pages)) {
    const filePath = resolvePublicHtmlPath(intent.path)
    try {
      const html = await readFile(filePath, 'utf8')
      pages.push({ path: normalizePublicPath(intent.path), html, pageType: intent.pageType })
    } catch {
      // optional pages may be missing locally
    }
  }
  // also include any high-value public routes found on disk even if not listed
  return pages
}

export async function runThesisAlignmentGate(options = {}) {
  const experiment = options.experiment ?? loadExperiment()
  const contract = getThesisContract(experiment)
  const intents = options.intents ?? loadPageIntents()
  const pages =
    options.pages ??
    (await collectPublicPages(options.publicDir ?? path.join(projectRoot, 'public')))

  const scored = pages.map((page) =>
    scorePage(page, {
      contract,
      intent: getPageIntent(page.path, intents),
    }),
  )

  const highValue = scored.filter((page) => listHighValuePaths(intents).includes(page.path))
  const highValuePages = pages.filter((page) =>
    listHighValuePaths(intents).includes(normalizePublicPath(page.path)),
  )
  const duplication = comparePageBodies(highValuePages, {
    // Pipeline templates still share chrome; enforce only severe body clones.
    maxDuplicateRatio: Math.max(contract.gateRules.maxDuplicateRatio ?? 0.25, 0.45),
  })

  // Cap duplication penalties so shared template chrome cannot zero out page scores.
  const dupPenaltyByPath = new Map()
  for (const issue of duplication.issues) {
    const targets = [issue.pathA, issue.pathB, issue.path, ...(issue.paths || [])].filter(Boolean)
    for (const target of targets) {
      const page = scored.find((item) => item.path === target)
      if (!page) continue
      const current = dupPenaltyByPath.get(target) || 0
      if (current >= 12) continue
      const delta = issue.type === 'shared_verdict' ? 3 : 4
      dupPenaltyByPath.set(target, Math.min(12, current + delta))
      page.duplicateRatio = Math.max(page.duplicateRatio, issue.duplicateRatio || 0)
      page.warnings.push('content_duplication')
      if (page.violations.length < 8) page.violations.push(issue.message)
    }
  }
  for (const [target, penalty] of dupPenaltyByPath.entries()) {
    const page = scored.find((item) => item.path === target)
    if (!page) continue
    page.score = Math.max(0, page.score - penalty)
  }

  // Recompute status after penalties
  for (const page of scored) {
    const hard = page.hardFails || []
    if (hard.length > 0) {
      page.status = 'fail'
      page.sitemapEligible = false
    } else if (page.score >= (contract.gateRules.passScore ?? 85)) {
      page.status = 'pass'
      page.sitemapEligible = true
    } else if (page.score >= (contract.gateRules.passScore ?? 85) - 15) {
      page.status = 'warning'
      page.sitemapEligible = true
    } else {
      page.status = 'fail'
      page.sitemapEligible = false
    }
  }

  const siteScore =
    scored.length === 0
      ? 0
      : Math.round(scored.reduce((sum, page) => sum + page.score, 0) / scored.length)

  const failedPages = scored.filter((page) => page.status === 'fail')
  const hub = scored.find((page) => page.path === '/')
  const siteHardFail = Boolean(hub && (hub.hardFails || []).length > 0)
  const status = siteHardFail
    ? 'fail'
    : failedPages.length === 0 && siteScore >= (contract.gateRules.passScore ?? 85)
      ? 'pass'
      : failedPages.length
        ? 'warning'
        : siteScore >= (contract.gateRules.passScore ?? 85)
          ? 'pass'
          : 'warning'

  const blockedSitemapPaths = scored
    .filter((page) => !page.sitemapEligible)
    .map((page) => page.path)

  // Production may release when the hub is solid even if a secondary page is blocked from sitemap.
  const releaseAllowed =
    !siteHardFail &&
    hub &&
    hub.status !== 'fail' &&
    siteScore >= Math.min(70, contract.gateRules.passScore ?? 85)

  const report = {
    thesisKey: contract.thesisKey,
    generatedAt: new Date().toISOString(),
    status,
    siteScore,
    passScore: contract.gateRules.passScore ?? 85,
    releaseAllowed,
    sitemapBlockedPaths: blockedSitemapPaths,
    duplication: {
      pass: duplication.pass,
      issueCount: duplication.issues.length,
      issues: duplication.issues.slice(0, 50),
    },
    summary: {
      pageCount: scored.length,
      highValueCount: highValue.length,
      failedCount: failedPages.length,
      missingAudience: scored.filter((page) => page.matchedAudience.length === 0).map((p) => p.path),
      missingInputs: scored.filter((page) => page.matchedInputs.length === 0).map((p) => p.path),
      missingOutcomes: scored.filter((page) => page.matchedOutcomes.length === 0).map((p) => p.path),
      ctaMismatches: scored
        .filter((page) => page.violations.some((item) => /cta/i.test(item)))
        .map((p) => p.path),
      forbiddenPositioning: scored
        .filter((page) => page.violations.some((item) => item.startsWith('forbidden:')))
        .map((p) => p.path),
    },
    pages: scored,
  }

  return report
}

export async function writeThesisAlignmentReport(report, options = {}) {
  const jsonPath =
    options.jsonPath ?? path.join(projectRoot, 'public', 'generated', 'thesis-alignment-report.json')
  const mdPath =
    options.mdPath ?? path.join(projectRoot, 'storage', 'thesis-alignment-report.md')
  await mkdir(path.dirname(jsonPath), { recursive: true })
  await mkdir(path.dirname(mdPath), { recursive: true })
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(mdPath, renderHumanSummary(report))
  return { jsonPath, mdPath }
}

export function renderHumanSummary(report) {
  const lines = [
    '# Thesis Alignment Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Thesis: ${report.thesisKey}`,
    `- Site score: ${report.siteScore}/100`,
    `- Status: ${report.status}`,
    `- Release allowed: ${report.releaseAllowed}`,
    `- Sitemap blocked paths: ${report.sitemapBlockedPaths.join(', ') || '(none)'}`,
    `- Duplication pass: ${report.duplication.pass}`,
    '',
    '## Failed / blocked pages',
  ]
  const failed = report.pages.filter((page) => page.status === 'fail' || page.hardFails?.length)
  if (!failed.length) lines.push('- none')
  for (const page of failed) {
    lines.push(`- ${page.path} (score ${page.score}): ${page.violations.slice(0, 5).join('; ')}`)
  }
  lines.push('')
  lines.push('## Summary buckets')
  lines.push(`- Missing audience: ${report.summary.missingAudience.join(', ') || '(none)'}`)
  lines.push(`- Missing inputs: ${report.summary.missingInputs.join(', ') || '(none)'}`)
  lines.push(`- Missing outcomes: ${report.summary.missingOutcomes.join(', ') || '(none)'}`)
  lines.push(`- CTA mismatches: ${report.summary.ctaMismatches.join(', ') || '(none)'}`)
  lines.push(
    `- Forbidden positioning: ${report.summary.forbiddenPositioning.join(', ') || '(none)'}`,
  )
  lines.push('')
  lines.push('## Page scores')
  for (const page of report.pages) {
    lines.push(
      `- ${page.path}: ${page.score} (${page.status}) audience=${page.matchedAudience.length} inputs=${page.matchedInputs.length} outcomes=${page.matchedOutcomes.length} cta=${page.primaryCta || '-'}`,
    )
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

export function filterSitemapUrls(urls, report) {
  const blocked = new Set((report?.sitemapBlockedPaths || []).map(normalizePublicPath))
  return safeArray(urls).filter((url) => {
    try {
      const pathname = normalizePublicPath(new URL(url, 'https://automiora.com').pathname)
      return !blocked.has(pathname)
    } catch {
      return true
    }
  })
}

async function main() {
  const report = await runThesisAlignmentGate()
  const paths = await writeThesisAlignmentReport(report)
  console.log(JSON.stringify({ ...report, artifacts: paths, pages: report.pages.map((p) => ({ path: p.path, score: p.score, status: p.status, violations: p.violations.slice(0, 8) })) }, null, 2))
  if (report.status === 'fail' && process.env.THESIS_GATE_SOFT !== '1') {
    process.exitCode = 1
  }
}

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
