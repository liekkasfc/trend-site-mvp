import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const siteSlug = 'ai-video-workflow-short-form-demo'
const siteBaseUrl = (process.env.SITE_BASE_URL || 'https://automiora.com').replace(/\/+$/, '')
const productionLike =
  process.env.AFFILIATE_FEATURE_ENABLED === 'true' &&
  process.env.AFFILIATE_ALLOW_TEST_URLS !== 'true'

const commercialPages = [
  {
    route: '/guides/ai-video-diy-vs-freelancer/',
    generatedFile: 'ai-video-diy-vs-freelancer.html',
    titlePattern: /SaaS product demo DIY vs freelancer/i,
  },
  {
    route: '/cost/ai-video-production-cost/',
    generatedFile: 'ai-video-production-cost.html',
    titlePattern: /SaaS product demo video cost/i,
  },
  {
    route: '/hire/ai-video-editor/',
    generatedFile: 'ai-video-editor.html',
    titlePattern: /Hire a SaaS product demo video editor/i,
  },
]

function routeIndexPath(rootDir, route) {
  return path.join(rootDir, route.replace(/^\/+|\/+$/g, ''), 'index.html')
}

function readHtml(filePath) {
  assert.equal(existsSync(filePath), true, `${filePath} should exist`)
  return readFileSync(filePath, 'utf8')
}

function canonicalUrl(route) {
  return new URL(route, `${siteBaseUrl}/`).toString()
}

function affiliateAnchors(html) {
  return [...html.matchAll(/<a\b[^>]*data-ga4-event="affiliate_click"[^>]*>/g)].map(
    (match) => match[0],
  )
}

describe('generated commercial affiliate pages', () => {
  for (const page of commercialPages) {
    it(`generates and validates ${page.route}`, () => {
      const publicPath = routeIndexPath(path.join(projectRoot, 'public'), page.route)
      const distPath = routeIndexPath(path.join(projectRoot, 'dist'), page.route)
      const generatedPath = path.join(
        projectRoot,
        'public',
        'generated-sites',
        siteSlug,
        page.generatedFile,
      )
      const publicHtml = readHtml(publicPath)
      const generatedHtml = readHtml(generatedPath)
      if (existsSync(path.join(projectRoot, 'dist'))) {
        readHtml(distPath)
      }

      assert.match(publicHtml, page.titlePattern)
      assert.match(publicHtml, /<meta name="description" content="[^"]{80,}"/i)
      assert.ok(publicHtml.includes(`rel="canonical" href="${canonicalUrl(page.route)}"`))
      assert.doesNotMatch(publicHtml, /<meta\s+name="robots"[^>]+noindex/i)
      assert.match(publicHtml, /Who should not|Not suitable|Not a fit|not for/i)
      assert.match(publicHtml, /decision|trigger|scope|quote|cost|revision/i)
      const anchors = affiliateAnchors(publicHtml)
      if (process.env.AFFILIATE_FEATURE_ENABLED === 'true') {
        assert.match(publicHtml, /This page contains affiliate links/)
        assert.equal(generatedHtml.includes('data-ga4-event="affiliate_click"'), true)
        const disclosureIndex = publicHtml.indexOf('This page contains affiliate links')
        const firstAffiliateIndex = publicHtml.indexOf('data-ga4-event="affiliate_click"')
        assert.ok(disclosureIndex >= 0 && disclosureIndex < firstAffiliateIndex)
        assert.ok(anchors.length > 0)
      } else {
        assert.doesNotMatch(publicHtml, /This page contains affiliate links/)
        assert.equal(anchors.length, 0)
      }
      assert.ok(anchors.length <= 3)
      for (const anchor of anchors) {
        assert.match(anchor, /\brel="[^"]*\bsponsored\b[^"]*\bnofollow\b[^"]*"/i)
        assert.doesNotMatch(anchor, /data-ga4-params="[^"]*https?:/i)
      }

      assert.doesNotMatch(publicHtml, /\b(None yet|TODO|Lorem ipsum)\b/i)
      assert.doesNotMatch(publicHtml, /\b(i personally used|we used|my team used)\b/i)
      assert.doesNotMatch(publicHtml, /(?:\.\.\.|…)\s*(?:<\/p>|$)/i)
      if (productionLike) {
        assert.doesNotMatch(publicHtml, /https:\/\/[^"'\s>]+(?:example\.test|\.test)/i)
      }
    })
  }
})

describe('commercial sitemap output', () => {
  it('includes indexable commercial pages and excludes internal routes', () => {
    const sitemap = readHtml(path.join(projectRoot, 'public', 'sitemap.xml'))
    for (const page of commercialPages) {
      assert.ok(sitemap.includes(canonicalUrl(page.route)), `${page.route} should be in sitemap`)
    }
    assert.doesNotMatch(sitemap, /\/ops\//)
    assert.doesNotMatch(sitemap, /\/prompt-pack\/ready\//)
    assert.doesNotMatch(sitemap, /thank-you/)
  })
})
