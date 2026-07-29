import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { readPublicRouteHtml, resolvePublicRouteFile } from '../scripts/seo-diagnostics.mjs'

const temporaryDirectories = []

async function createPublicDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'automiora-seo-diagnostics-'))
  temporaryDirectories.push(root)
  const publicDir = path.join(root, 'public')
  await mkdir(publicDir, { recursive: true })
  return publicDir
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('SEO public route resolution', () => {
  it('resolves the root route to public/index.html', async () => {
    const publicDir = await createPublicDirectory()
    await writeFile(path.join(publicDir, 'index.html'), '<title>Home</title>\n')

    assert.equal(await resolvePublicRouteFile(publicDir, '/'), path.join(publicDir, 'index.html'))
  })

  it('resolves directory routes to their index.html file', async () => {
    const publicDir = await createPublicDirectory()
    await mkdir(path.join(publicDir, 'workflow'), { recursive: true })
    await writeFile(path.join(publicDir, 'workflow', 'index.html'), '<title>Workflow</title>\n')

    assert.equal(
      await resolvePublicRouteFile(publicDir, '/workflow/'),
      path.join(publicDir, 'workflow', 'index.html'),
    )
    const page = await readPublicRouteHtml('https://automiora.com/workflow/', 'https://automiora.com', {
      publicDir,
    })
    assert.match(page.html, /Workflow/)
  })

  it('supports a real html file route', async () => {
    const publicDir = await createPublicDirectory()
    await writeFile(path.join(publicDir, 'legacy.html'), '<title>Legacy</title>\n')

    assert.equal(
      await resolvePublicRouteFile(publicDir, '/legacy.html'),
      path.join(publicDir, 'legacy.html'),
    )
  })

  it('reports a directory route that is missing index.html without EISDIR', async () => {
    const publicDir = await createPublicDirectory()
    await mkdir(path.join(publicDir, 'workflow'), { recursive: true })

    await assert.rejects(
      resolvePublicRouteFile(publicDir, '/workflow/'),
      (error) => {
        assert.doesNotMatch(error.message, /EISDIR/)
        assert.match(error.message, /\/workflow\//)
        assert.match(error.message, /workflow\/index\.html/)
        return true
      },
    )
  })
})
