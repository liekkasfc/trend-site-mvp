import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import { routeRequiresStructuredData } from '../scripts/seo-diagnostics.mjs'

const diagnosticsPath = new URL('../scripts/seo-diagnostics.mjs', import.meta.url)

describe('SEO diagnostics local-route contract', () => {
  it('maps directory-style public URLs to index.html before reading', async () => {
    const source = await readFile(diagnosticsPath, 'utf8')

    assert.match(source, /pathname\.endsWith\('\/'\)\s*\?\s*path\.join\(relativePath, 'index\.html'\)/)
  })

  it('requires schema for content routes but not asset or consult landing pages', () => {
    assert.equal(routeRequiresStructuredData({ kind: 'core' }), true)
    assert.equal(routeRequiresStructuredData({ kind: 'commercial' }), true)
    assert.equal(routeRequiresStructuredData({ kind: 'asset' }), false)
    assert.equal(routeRequiresStructuredData({ kind: 'consult' }), false)
  })
})
