import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const trackingParameterPattern = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i

export function normalizeStableText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function buildStableClaimKey({ siteSlug, claimKind, statement, sourceIds = [] }) {
  const stableSourceIds = [...new Set(sourceIds.map((sourceId) => String(sourceId).trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en'))
  return `${normalizeStableText(siteSlug)}:${normalizeStableText(claimKind)}:${normalizeStableText(statement)}:${stableSourceIds.join('|')}`
}

export function buildStableReviewKey({ siteSlug, targetId, targetType = 'cluster' }) {
  return `${normalizeStableText(siteSlug)}:${normalizeStableText(targetType)}:${normalizeStableText(targetId)}`
}

export function pipelineNow(env = process.env) {
  const fixedNow = String(env.PIPELINE_FIXED_NOW ?? '').trim()
  const now = fixedNow ? new Date(fixedNow) : new Date()
  if (Number.isNaN(now.getTime())) {
    throw new Error(`PIPELINE_FIXED_NOW must be a valid ISO timestamp, received: ${fixedNow}`)
  }
  return now
}

export function canonicalizeSourceUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    url.protocol = url.protocol.toLowerCase()
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameterPattern.test(key)) url.searchParams.delete(key)
    }
    url.searchParams.sort()
    url.pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\?$/, '').replace(/\/$/, url.pathname === '/' ? '/' : '')
  } catch {
    return raw.replace(/\s+/g, ' ')
  }
}

export function stableUniqueByCanonicalUrl(values = []) {
  const byUrl = new Map()
  for (const value of values) {
    const canonicalUrl = canonicalizeSourceUrl(value?.url)
    if (!canonicalUrl) continue
    const candidate = { ...value, url: canonicalUrl }
    const existing = byUrl.get(canonicalUrl)
    if (!existing || stableStringify(candidate).localeCompare(stableStringify(existing), 'en') < 0) {
      byUrl.set(canonicalUrl, candidate)
    }
  }
  return [...byUrl.entries()]
    .sort(([leftUrl, left], [rightUrl, right]) => {
      const urlOrder = leftUrl.localeCompare(rightUrl, 'en')
      return urlOrder || String(left?.id ?? '').localeCompare(String(right?.id ?? ''), 'en')
    })
    .map(([, value]) => value)
}

export function normalizeFileContent(content) {
  return `${String(content ?? '').replace(/\r\n?/g, '\n').trimEnd()}\n`
}

export async function writeFileIfChanged(filePath, content, options) {
  const normalizedContent = normalizeFileContent(content)
  if (existsSync(filePath)) {
    const existingContent = normalizeFileContent(await readFile(filePath, 'utf8'))
    if (existingContent === normalizedContent) return false
  }
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, normalizedContent, options)
  return true
}
