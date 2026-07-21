import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  getExcludedProductionPrefixes,
  getIndexableProductionPaths,
  loadRouteManifest,
  routeToUrl,
} from '../scripts/route-manifest.mjs'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)

function publicFileForRoute(routePath) {
  return routePath === '/'
    ? path.join(projectRoot, 'public', 'index.html')
    : path.join(projectRoot, 'public', routePath.replace(/^\//, ''), 'index.html')
}

describe('generated production route assets', () => {
  it('publishes a canonical non-null pipeline gate summary', async () => {
    const report = JSON.parse(
      await readFile(path.join(projectRoot, 'public', 'generated', 'pipeline-report.json'), 'utf8'),
    )

    assert.match(report.publishGateStatus, /^(?:pass|fail|warning|skipped)$/)
    assert.equal(report.publishGate.status, report.publishGateStatus)
  })

  it('uses production canonicals and never points social images at generated-sites', async () => {
    const manifest = loadRouteManifest()
    for (const routePath of getIndexableProductionPaths({ manifest })) {
      const html = await readFile(publicFileForRoute(routePath), 'utf8')
      assert.match(html, new RegExp(`rel="canonical" href="${routeToUrl(routePath, manifest.baseUrl)}"`))

      const socialImages = [
        ...html.matchAll(/<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/gi),
      ].map((match) => match[1])
      for (const imageUrl of socialImages) assert.doesNotMatch(imageUrl, /\/generated-sites\//)
    }
  })

  it('keeps debug and confirmation routes out of sitemap and blocks every excluded prefix in robots', async () => {
    const manifest = loadRouteManifest()
    const [sitemap, robots] = await Promise.all([
      readFile(path.join(projectRoot, 'public', 'sitemap.xml'), 'utf8'),
      readFile(path.join(projectRoot, 'public', 'robots.txt'), 'utf8'),
    ])

    assert.doesNotMatch(sitemap, /\/generated-sites\/|\/ops\/|\/ready\//)
    for (const prefix of getExcludedProductionPrefixes({ manifest })) {
      assert.match(robots, new RegExp(`Disallow: ${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    }
  })

  it('keeps every CTA target on a declared production route', () => {
    const manifest = loadRouteManifest()
    const declaredPaths = new Set(manifest.productionRoutes.map((route) => route.path))
    for (const route of manifest.productionRoutes) {
      if (route.ctaHref) assert.ok(declaredPaths.has(route.ctaHref), `${route.path} -> ${route.ctaHref}`)
    }
  })
})
