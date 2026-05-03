import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = process.cwd()
const sitesRoot = path.join(projectRoot, 'public', 'generated-sites')
const bucketName = process.env.CLOUDFLARE_R2_BUCKET ?? 'automiora-site-assets-prod'

async function main() {
  const uploads = await collectUploads()
  if (uploads.length === 0) {
    console.log('No generated asset downloads found.')
    return
  }

  for (const upload of uploads) {
    const remoteKey = `${bucketName}/${upload.objectKey}`
    console.log(`Uploading ${upload.localPath} -> ${remoteKey}`)
    await execFileAsync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'put',
        remoteKey,
        '--remote',
        '--file',
        upload.localPath,
        '--content-type',
        'text/markdown; charset=utf-8',
      ],
      { cwd: projectRoot },
    )
  }

  console.log(`Uploaded ${uploads.length} asset file(s) to ${bucketName}.`)
}

async function collectUploads() {
  const siteEntries = await readdir(sitesRoot, { withFileTypes: true })
  const uploads = []

  for (const siteEntry of siteEntries) {
    if (!siteEntry.isDirectory()) continue
    const downloadsDir = path.join(sitesRoot, siteEntry.name, 'downloads')
    let files = []
    try {
      files = await readdir(downloadsDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue
      uploads.push({
        localPath: path.join(downloadsDir, file.name),
        objectKey: `generated-sites/${siteEntry.name}/downloads/${file.name}`,
      })
    }
  }

  return uploads
}

await main()
