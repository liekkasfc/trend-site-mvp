import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(projectRoot, 'public')
const baseUrl = 'https://automiora.com'
const indexableAssetRoutes = ['/audit/', '/prompt-pack/', '/workflow-checklist/', '/comparison-worksheet/']
const confirmationRoutes = [
  '/audit/ready/',
  '/prompt-pack/ready/',
  '/workflow-checklist/ready/',
  '/comparison-worksheet/ready/',
]
const indexableRoutes = [
  '/',
  '/audit/',
  '/best-tools/',
  '/case-study/',
  '/compare/',
  '/comparison-worksheet/',
  '/cost/ai-video-production-cost/',
  '/faq/',
  '/free-vs-paid/',
  '/guides/ai-video-diy-vs-freelancer/',
  '/hire/ai-video-editor/',
  '/pricing/',
  '/prompt-pack/',
  '/templates/',
  '/use-cases/',
  '/workflow-checklist/',
  '/workflow/',
]

function routeFile(route) {
  if (route === '/') return path.join(publicDir, 'index.html')
  return path.join(publicDir, route.replace(/^\/+|\/+$/g, ''), 'index.html')
}

function extractMeta(html, attribute, value) {
  const pattern = new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]+)"`, 'i')
  return html.match(pattern)?.[1] ?? ''
}

describe('public sitemap contract', () => {
  it('indexes asset and consultation landing pages but not confirmation pages', () => {
    const sitemap = readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8')
    for (const route of indexableAssetRoutes) {
      const canonical = new URL(route, `${baseUrl}/`).toString()
      assert.equal(existsSync(routeFile(route)), true, `${route} should have a public file`)
      assert.match(sitemap, new RegExp(`<loc>${canonical}</loc>`))
      assert.match(readFileSync(routeFile(route), 'utf8'), new RegExp(`rel="canonical" href="${canonical}"`))
    }
    for (const route of confirmationRoutes) {
      assert.doesNotMatch(sitemap, new RegExp(new URL(route, `${baseUrl}/`).toString()))
    }
    assert.doesNotMatch(sitemap, /\/(?:generated-sites|ops|downloads)\//)
    assert.doesNotMatch(sitemap, /\/ready\//)
  })

  it('validates all 21 production route files, canonicals, and index policies', () => {
    const sitemap = readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8')
    const robots = readFileSync(path.join(publicDir, 'robots.txt'), 'utf8')
    for (const route of [...indexableRoutes, ...confirmationRoutes]) {
      const filePath = routeFile(route)
      const canonical = new URL(route, `${baseUrl}/`).toString()
      assert.equal(existsSync(filePath), true, `${route} should have a public file`)
      const html = readFileSync(filePath, 'utf8')
      assert.match(html, new RegExp(`rel="canonical" href="${canonical}"`))
      if (indexableRoutes.includes(route)) {
        assert.match(sitemap, new RegExp(`<loc>${canonical}</loc>`))
        assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/i)
      } else {
        assert.doesNotMatch(sitemap, new RegExp(`<loc>${canonical}</loc>`))
        assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i)
      }
      assert.doesNotMatch(html, /https:\/\/affiliate\.example\.test/i)
    }
    assert.match(robots, /Disallow: \/generated-sites\//)
    assert.match(robots, /Disallow: \/ops\//)
  })
})

describe('public social image contract', () => {
  it('uses crawlable public media for every production HTML document', () => {
    const htmlFiles = execFileSync('git', ['ls-files', 'public/**/index.html', 'public/index.html'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((file) => file && !file.includes('/generated-sites/'))

    for (const relativeFile of htmlFiles) {
      const html = readFileSync(path.join(projectRoot, relativeFile), 'utf8')
      const ogImage = extractMeta(html, 'property', 'og:image')
      const twitterImage = extractMeta(html, 'name', 'twitter:image')
      if (!ogImage && !twitterImage) continue
      assert.equal(ogImage, twitterImage, `${relativeFile} should use the same social image`)
      assert.match(ogImage, /^https:\/\/automiora\.com\/media\/[a-z0-9._-]+$/i)
      assert.doesNotMatch(ogImage, /\/generated-sites\//)
      const mediaPath = new URL(ogImage).pathname.replace(/^\/+/, '')
      assert.equal(existsSync(path.join(publicDir, mediaPath)), true, `${ogImage} should exist`)
    }
  })
})

describe('portable tracked paths', () => {
  it('does not contain a developer home directory', () => {
    const developerPath = ['/Users', 'max', ''].join('/')
    const trackedFiles = execFileSync(
      'git',
      ['ls-files', 'config', 'scripts', 'public', 'workers', 'test', 'wiki', 'docs', '.github'],
      { cwd: projectRoot, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
    const offenders = trackedFiles.filter((file) => {
      const filePath = path.join(projectRoot, file)
      return existsSync(filePath) && readFileSync(filePath, 'utf8').includes(developerPath)
    })
    assert.deepEqual(offenders, [])
  })
})
