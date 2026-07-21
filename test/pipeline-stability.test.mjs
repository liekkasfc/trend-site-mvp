import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  buildStableClaimKey,
  buildStableReviewKey,
  canonicalizeSourceUrl,
  pipelineNow,
  stableStringify,
  stableUniqueByCanonicalUrl,
  writeFileIfChanged,
} from '../scripts/pipeline-stability.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('pipeline stability helpers', () => {
  it('uses PIPELINE_FIXED_NOW as the single offline clock', () => {
    assert.equal(
      pipelineNow({ PIPELINE_FIXED_NOW: '2026-07-21T00:00:00.000Z' }).toISOString(),
      '2026-07-21T00:00:00.000Z',
    )
    assert.throws(() => pipelineNow({ PIPELINE_FIXED_NOW: 'not-a-date' }), /PIPELINE_FIXED_NOW/)
  })

  it('canonicalizes equivalent source URLs', () => {
    assert.equal(
      canonicalizeSourceUrl('HTTPS://Example.com/path/?utm_source=test&b=2&a=1#section'),
      'https://example.com/path?a=1&b=2',
    )
  })

  it('deduplicates sources by canonical URL and returns stable ordering', () => {
    const sources = stableUniqueByCanonicalUrl([
      { id: 'z', url: 'https://example.com/b?utm_campaign=x' },
      { id: 'a', url: 'https://example.com/a/' },
      { id: 'duplicate', url: 'https://example.com/a?utm_source=y' },
    ])

    assert.deepEqual(sources.map((source) => source.id), ['a', 'z'])
  })

  it('selects the same canonical source when duplicate input order changes', () => {
    const first = { id: 'b', url: 'https://example.com/a?utm_source=one', title: 'Second' }
    const second = { id: 'a', url: 'https://example.com/a/', title: 'First' }
    assert.deepEqual(
      stableUniqueByCanonicalUrl([first, second]),
      stableUniqueByCanonicalUrl([second, first]),
    )
  })

  it('builds stable claim and review identities', () => {
    assert.equal(
      buildStableClaimKey({
        siteSlug: 'Demo-Site',
        claimKind: 'Workflow',
        statement: '  One   stable claim ',
        sourceIds: ['source-b', 'source-a', 'source-a'],
      }),
      buildStableClaimKey({
        siteSlug: 'demo-site',
        claimKind: 'workflow',
        statement: 'one stable claim',
        sourceIds: ['source-a', 'source-b'],
      }),
    )
    assert.equal(
      buildStableReviewKey({ siteSlug: 'Demo-Site', targetId: 'Cluster.One' }),
      buildStableReviewKey({ siteSlug: 'demo-site', targetId: 'cluster.one' }),
    )
  })

  it('serializes object keys deterministically', () => {
    assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('does not rewrite a file when normalized content is unchanged', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'automiora-write-if-changed-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'output.txt')
    await writeFile(filePath, 'same content\n')
    const before = await stat(filePath)

    assert.equal(await writeFileIfChanged(filePath, 'same content\r\n'), false)
    const after = await stat(filePath)
    assert.equal(after.mtimeMs, before.mtimeMs)
    assert.equal(await readFile(filePath, 'utf8'), 'same content\n')

    assert.equal(await writeFileIfChanged(filePath, 'changed\n'), true)
    assert.equal(await readFile(filePath, 'utf8'), 'changed\n')
  })
})
