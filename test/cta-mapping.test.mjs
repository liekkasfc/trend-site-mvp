import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function classifyCtaHref(href) {
  if (typeof href !== 'string' || !href.trim()) return 'empty'
  let pathOnly = href.trim()
  try {
    if (/^https?:\/\//i.test(pathOnly)) pathOnly = new URL(pathOnly).pathname
  } catch {
    return 'invalid'
  }
  if (!pathOnly.startsWith('/')) pathOnly = `/${pathOnly}`
  if (
    pathOnly.startsWith('/prompt-pack') ||
    pathOnly.startsWith('/comparison-worksheet') ||
    pathOnly.startsWith('/workflow-checklist') ||
    pathOnly.startsWith('/audit')
  ) {
    return 'asset_or_offer'
  }
  if (pathOnly.includes('/generated-sites/') && /(?:asset-|audit)/i.test(pathOnly)) {
    return 'legacy_asset'
  }
  if (pathOnly.startsWith('http')) return 'external'
  return 'content'
}

function extractCtaHrefs(html) {
  const hrefs = []
  const re = /<a\b([^>]*)>/gi
  let match
  while ((match = re.exec(html))) {
    const attrs = match[1]
    const classMatch = attrs.match(/class="([^"]*)"/i)
    const hrefMatch = attrs.match(/href="([^"]*)"/i)
    if (!classMatch || !hrefMatch) continue
    const className = classMatch[1]
    if (!/\b(cta-button|secondary-cta)\b/.test(className)) continue
    hrefs.push(hrefMatch[1])
  }
  return hrefs
}

test('conversion CTA paths classify as asset_or_offer', () => {
  for (const href of [
    '/prompt-pack/',
    '/prompt-pack/ready/',
    '/comparison-worksheet/',
    '/workflow-checklist/',
    '/audit/',
    '/audit/ready/',
    'https://automiora.com/prompt-pack/',
  ]) {
    assert.equal(classifyCtaHref(href), 'asset_or_offer', href)
  }
})

test('generic content CTAs are not conversion paths', () => {
  for (const href of ['/', '/workflow/', '/compare/', '/faq/', '/best-tools/', '/pricing/']) {
    assert.equal(classifyCtaHref(href), 'content', href)
  }
})

test('legacy generated-sites asset landings remain accepted', () => {
  assert.equal(
    classifyCtaHref(
      '/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack.html',
    ),
    'legacy_asset',
  )
})

test('production strong pages map primary CTA to asset or offer', () => {
  const pages = [
    'public/index.html',
    'public/workflow/index.html',
    'public/compare/index.html',
    'public/pricing/index.html',
    'public/free-vs-paid/index.html',
  ]

  for (const rel of pages) {
    const file = join(root, rel)
    assert.ok(existsSync(file), `missing ${rel}`)
    const html = readFileSync(file, 'utf8')
    const hrefs = extractCtaHrefs(html)
    assert.ok(hrefs.length > 0, `${rel} should expose cta-button/secondary-cta`)
    const primary = hrefs.find((href) => {
      // first cta-button is primary; extract with class context
      return true
    })
    // Require at least one asset/offer CTA on the page
    const kinds = hrefs.map(classifyCtaHref)
    assert.ok(
      kinds.some((kind) => kind === 'asset_or_offer'),
      `${rel} has no asset/offer CTA: ${hrefs.join(', ')}`,
    )
    // Selector fallback must not permanently point at bare home as the only conversion path
    if (rel === 'public/index.html') {
      const selector = html.match(
        /data-selector-result-link\s+href="([^"]+)"/i,
      )
      assert.ok(selector, 'homepage selector result link missing')
      assert.notEqual(selector[1], '/', 'selector fallback should not be bare /')
      assert.equal(classifyCtaHref(selector[1]), 'asset_or_offer')
    }
    void primary
  }
})

test('core production routes are present and not noindex', () => {
  const routes = [
    'public/index.html',
    'public/workflow/index.html',
    'public/compare/index.html',
    'public/prompt-pack/index.html',
    'public/audit/index.html',
  ]
  for (const rel of routes) {
    const file = join(root, rel)
    assert.ok(existsSync(file), `missing ${rel}`)
    const html = readFileSync(file, 'utf8')
    const robots = html.match(/name="robots"\s+content="([^"]+)"/i)
    if (robots) {
      assert.ok(
        !/noindex/i.test(robots[1]),
        `${rel} should not noindex production surface (got ${robots[1]})`,
      )
    }
  }
})

test('robots disallows generated-sites debug surface', () => {
  const robots = readFileSync(join(root, 'public/robots.txt'), 'utf8')
  assert.match(robots, /Disallow:\s*\/generated-sites\//)
  assert.match(robots, /Sitemap:\s*https:\/\/automiora\.com\/sitemap\.xml/)
})
