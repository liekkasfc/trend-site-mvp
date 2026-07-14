/**
 * Cross-page content duplication checks for public HTML.
 */

const BOILERPLATE_PATTERNS = [
  /cookie/i,
  /privacy policy/i,
  /terms of service/i,
  /all rights reserved/i,
  /affiliate links/i,
  /may earn a commission/i,
  /©\s*\d{4}/i,
]

export function stripHtmlToMainText(html) {
  let text = String(html || '')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

export function sentenceFingerprint(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 55)
    .filter((sentence) => !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(sentence)))
    .filter(
      (sentence) =>
        !/\b(Overview|Alternatives|Workflow|Pricing|Free vs Paid|Use Cases|Template Kit|Case Study|DIY vs Hire|Cost Guide|Hire Editor)\b/.test(
          sentence,
        ),
    )
}

export function comparePageBodies(pages, options = {}) {
  const maxRatio = options.maxDuplicateRatio ?? 0.25
  const pairs = []
  const verdictCounts = new Map()
  const issues = []

  const prepared = pages.map((page) => {
    const body = stripHtmlToMainText(page.html)
    const sentences = extractSentences(body)
    const fingerprints = sentences.map(sentenceFingerprint).filter(Boolean)
    return {
      path: page.path,
      body,
      sentences,
      fingerprints,
      set: new Set(fingerprints),
    }
  })

  // Drop chrome sentences that appear on many pages before pair scoring.
  const globalCounts = new Map()
  for (const page of prepared) {
    for (const fp of new Set(page.fingerprints)) {
      globalCounts.set(fp, (globalCounts.get(fp) || 0) + 1)
    }
  }
  for (const page of prepared) {
    page.fingerprints = page.fingerprints.filter((fp) => (globalCounts.get(fp) || 0) < 4)
    page.set = new Set(page.fingerprints)
  }

  for (const page of prepared) {
    for (const fp of page.fingerprints) {
      if (!verdictLike(fp)) continue
      const entry = verdictCounts.get(fp) ?? { count: 0, paths: [] }
      entry.count += 1
      if (!entry.paths.includes(page.path)) entry.paths.push(page.path)
      verdictCounts.set(fp, entry)
    }
  }

  for (const [fp, entry] of verdictCounts.entries()) {
    if (entry.paths.length >= 3) {
      issues.push({
        type: 'shared_verdict',
        fingerprint: fp.slice(0, 160),
        paths: entry.paths,
        message: `Same verdict-like sentence appears on ${entry.paths.length} pages`,
      })
    }
  }

  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i]
      const b = prepared[j]
      if (a.fingerprints.length === 0 || b.fingerprints.length === 0) continue
      const overlap = a.fingerprints.filter((fp) => b.set.has(fp))
      const ratio = overlap.length / Math.min(a.fingerprints.length, b.fingerprints.length)
      const consecutive = maxConsecutiveOverlap(a.fingerprints, b.set)
      const pair = {
        pathA: a.path,
        pathB: b.path,
        duplicateRatio: Number(ratio.toFixed(3)),
        overlapCount: overlap.length,
        sample: overlap.slice(0, 3).map((item) => item.slice(0, 140)),
        consecutiveOverlap: consecutive,
      }
      pairs.push(pair)
      if (ratio > maxRatio) {
        issues.push({
          type: 'pair_ratio',
          ...pair,
          message: `Duplicate ratio ${pair.duplicateRatio} exceeds ${maxRatio}`,
        })
      }
      if (consecutive >= 5) {
        issues.push({
          type: 'consecutive_paragraphs',
          pathA: a.path,
          pathB: b.path,
          consecutiveOverlap: consecutive,
          message: `At least ${consecutive} consecutive overlapping sentences`,
        })
      }
    }
  }

  // Hub repeated recommendation / failure blocks
  const hub = prepared.find((page) => page.path === '/')
  if (hub) {
    const counts = new Map()
    for (const fp of hub.fingerprints) {
      counts.set(fp, (counts.get(fp) || 0) + 1)
    }
    for (const [fp, count] of counts.entries()) {
      if (count > 2 && /(runway|pika|failure|recommend|fix)/i.test(fp)) {
        issues.push({
          type: 'hub_repeat',
          path: '/',
          fingerprint: fp.slice(0, 140),
          count,
          message: `Hub repeats the same tool/failure sentence ${count} times`,
        })
      }
    }
  }

  return {
    pairs,
    issues,
    pass: !issues.some((issue) => issue.type === 'pair_ratio' || issue.type === 'consecutive_paragraphs' || issue.type === 'shared_verdict' || issue.type === 'hub_repeat'),
  }
}

function verdictLike(fp) {
  return /\b(start with|best first|recommend|should be|stay free|upgrade when|runway first|primary pick)\b/i.test(fp)
}

function maxConsecutiveOverlap(sequence, otherSet) {
  let best = 0
  let current = 0
  for (const fp of sequence) {
    if (otherSet.has(fp)) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

export function detectUnlabeledFabricatedCaseStudy(html, pathName = '') {
  if (!/case-study/i.test(pathName) && !/case study/i.test(html)) {
    return { ok: true, violations: [] }
  }
  const text = stripHtmlToMainText(html)
  const violations = []
  const hasLabel = /\b(worked example|internal test|production scenario)\b/i.test(text)
  const metricClaims = text.match(
    /\b(\d{1,3}%\s+(increase|lift|conversion|ctr|roi)|saved\s+\$\d+|\d+x\s+(roi|growth)|customer\s+\w+\s+increased)\b/gi,
  )
  if (metricClaims?.length && !hasLabel) {
    violations.push('unlabeled_metric_claim_on_case_study')
  }
  if (/\b(Acme Corp|Customer X|our client)\b/i.test(text) && !hasLabel) {
    violations.push('fabricated_or_unlabeled_customer_story')
  }
  if (!hasLabel && /before\b[\s\S]{0,80}\bafter\b/i.test(text)) {
    // before/after without label is a warning-level for case study pages
    if (/case-study/i.test(pathName)) violations.push('case_study_missing_worked_example_label')
  }
  return { ok: violations.length === 0, violations, hasLabel }
}
