import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const distDir = path.join(projectRoot, 'dist')
const publicDir = path.join(projectRoot, 'public')

async function main() {
  const distIndexPath = path.join(distDir, 'index.html')
  const publicIndexPath = path.join(publicDir, 'index.html')
  const opsDir = path.join(distDir, 'ops')
  const opsIndexPath = path.join(opsDir, 'index.html')

  const dashboardHtml = await readFile(distIndexPath, 'utf8')
  const rootHtml = await readFile(publicIndexPath, 'utf8')

  await mkdir(opsDir, { recursive: true })
  await writeFile(opsIndexPath, dashboardHtml)
  await writeFile(distIndexPath, rootHtml)

  console.log(
    JSON.stringify(
      {
        root: distIndexPath,
        ops: opsIndexPath,
        status: 'ok',
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
