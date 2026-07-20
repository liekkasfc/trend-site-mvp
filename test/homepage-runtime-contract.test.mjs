import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const homepagePath = new URL('../public/index.html', import.meta.url)

describe('generated homepage runtime contract', () => {
  it('constrains the curated hero image to its responsive container', async () => {
    const html = await readFile(homepagePath, 'utf8')

    assert.match(html, /\.hero-visual img\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*auto;/s)
    assert.match(html, /src="\/media\/index-hero-workflow-v2\.png"/)
  })

  it('declares the SVG favicon so browsers do not request a missing favicon.ico', async () => {
    const html = await readFile(homepagePath, 'utf8')

    assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"\s*\/?>/)
  })

  it('keeps the desktop proof visual top-aligned and gives mobile navigation a compact grid', async () => {
    const html = await readFile(homepagePath, 'utf8')

    assert.match(html, /\.hero-layout\s*\{[^}]*align-items:\s*start;/s)
    assert.match(
      html,
      /@media \(max-width: 720px\)\s*\{[^}]*\.topbar\s*\{[^}]*flex-direction:\s*column;[^}]*\}[^}]*\.topbar nav\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    )
  })
})
