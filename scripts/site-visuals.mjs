import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseBooleanFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '')
}

function normalizeImageProvider(value) {
  const normalized = String(value ?? 'openai').trim().toLowerCase()
  if (normalized === 'hiapi') return 'hiapi'
  return 'openai'
}

function getDefaultApiBaseUrl(provider) {
  if (provider === 'hiapi') return 'https://api.hiapi.ai/v1'
  return 'https://api.openai.com/v1'
}

function getImageApiKey(provider) {
  const siteApiKey = (process.env.SITE_IMAGE_API_KEY ?? '').trim()
  if (siteApiKey) return siteApiKey
  if (provider === 'hiapi') return (process.env.HIAPI_API_KEY ?? '').trim()
  return (process.env.OPENAI_API_KEY ?? '').trim()
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function dedupe(values) {
  return [...new Set((values ?? []).filter(Boolean))]
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return Promise.resolve(fallback)
  return readFile(filePath, 'utf8')
    .then((content) => JSON.parse(content))
    .catch(() => fallback)
}

const imageProvider = normalizeImageProvider(process.env.SITE_IMAGE_PROVIDER)
const imageConfig = {
  enabled: parseBooleanFlag(process.env.SITE_IMAGE_GENERATION_ENABLED, true),
  provider: imageProvider,
  apiKey: getImageApiKey(imageProvider),
  apiBaseUrl: trimTrailingSlash(
    process.env.SITE_IMAGE_API_BASE_URL ?? getDefaultApiBaseUrl(imageProvider),
  ),
  model: (process.env.SITE_IMAGE_MODEL ?? 'gpt-image-2').trim() || 'gpt-image-2',
  fallbackModels: dedupe(
    (process.env.SITE_IMAGE_FALLBACK_MODELS ?? 'gpt-image-1.5,gpt-image-1')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
  quality: (process.env.SITE_IMAGE_QUALITY ?? 'medium').trim() || 'medium',
  outputFormat: (process.env.SITE_IMAGE_OUTPUT_FORMAT ?? 'webp').trim() || 'webp',
  background: (process.env.SITE_IMAGE_BACKGROUND ?? 'opaque').trim() || 'opaque',
  hiapiAspectRatio: (process.env.SITE_IMAGE_HIAPI_ASPECT_RATIO ?? '').trim(),
  hiapiImageSize: (process.env.SITE_IMAGE_HIAPI_IMAGE_SIZE ?? '').trim(),
  heroSize: (process.env.SITE_IMAGE_HERO_SIZE ?? '1536x1024').trim() || '1536x1024',
  assetSize: (process.env.SITE_IMAGE_ASSET_SIZE ?? '1536x1024').trim() || '1536x1024',
  pageTypes: dedupe(
    (process.env.SITE_IMAGE_PAGE_TYPES ?? 'hub,workflow,use-cases,template-kit,case-study')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
  assetKinds: dedupe(
    (process.env.SITE_IMAGE_ASSET_KINDS ?? 'template_pack,checklist,worksheet')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
  promptVersion: 'v1',
}

imageConfig.canGenerate =
  imageConfig.enabled &&
  ['openai', 'hiapi'].includes(imageConfig.provider) &&
  Boolean(imageConfig.apiKey)

const hiapiAspectRatioCandidates = [
  { label: '1:1', width: 1, height: 1 },
  { label: '16:9', width: 16, height: 9 },
  { label: '9:16', width: 9, height: 16 },
  { label: '4:3', width: 4, height: 3 },
  { label: '3:4', width: 3, height: 4 },
]

function parseSize(size) {
  const match = String(size ?? '').match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return { width, height }
}

function getNearestHiApiAspectRatio(size) {
  if (imageConfig.hiapiAspectRatio) return imageConfig.hiapiAspectRatio
  const parsed = parseSize(size)
  if (!parsed) return '16:9'
  const target = parsed.width / parsed.height
  let best = hiapiAspectRatioCandidates[0]
  let bestDelta = Number.POSITIVE_INFINITY

  for (const candidate of hiapiAspectRatioCandidates) {
    const ratio = candidate.width / candidate.height
    const delta = Math.abs(target - ratio)
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }

  return best.label
}

function getHiApiImageSize(size) {
  if (imageConfig.hiapiImageSize) return imageConfig.hiapiImageSize
  const parsed = parseSize(size)
  const maxDimension = Math.max(parsed?.width ?? 0, parsed?.height ?? 0)
  if (maxDimension >= 3072) return '4K'
  if (maxDimension >= 1400) return '2K'
  return '1K'
}

function getHiApiImageConfig(size) {
  const aspectRatio = getNearestHiApiAspectRatio(size)
  const imageSize = getHiApiImageSize(size)
  if (imageSize === '4K' && aspectRatio === '1:1') {
    return { aspect_ratio: aspectRatio, image_size: '2K' }
  }
  return { aspect_ratio: aspectRatio, image_size: imageSize }
}

function getExtensionFromMimeType(mimeType, fallback = imageConfig.outputFormat) {
  const normalized = String(mimeType ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  return fallback
}

function getExtensionFromUrl(value, fallback = imageConfig.outputFormat) {
  try {
    const pathname = new URL(value).pathname.toLowerCase()
    if (pathname.endsWith('.png')) return 'png'
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg'
    if (pathname.endsWith('.webp')) return 'webp'
    if (pathname.endsWith('.gif')) return 'gif'
  } catch {}
  return fallback
}

function collectChatContentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item?.text === 'string') return item.text
      if (typeof item?.image_url?.url === 'string') return item.image_url.url
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractMarkdownImageSources(markdown) {
  const sources = []
  const patterns = [
    /!\[[^\]]*]\((data:image\/[^)]+)\)/gi,
    /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi,
    /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/gi,
    /(https?:\/\/[^\s)]+(?:png|jpg|jpeg|webp|gif))/gi,
  ]

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const source = String(match[1] ?? match[0] ?? '').trim()
      if (source) sources.push(source)
    }
  }

  return dedupe(sources)
}

async function fetchImageBufferFromSource(source) {
  if (source.startsWith('data:image/')) {
    const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i)
    if (!match) {
      return { ok: false, error: 'HiAPI returned an unsupported data URI.' }
    }

    return {
      ok: true,
      mimeType: match[1],
      extension: getExtensionFromMimeType(match[1]),
      buffer: Buffer.from(match[2].replace(/\s+/g, ''), 'base64'),
    }
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const response = await fetch(source)
      if (!response.ok) {
        return {
          ok: false,
          error: `HiAPI returned an image URL but the fetch failed (${response.status}).`,
        }
      }
      const mimeType = response.headers.get('content-type') ?? ''
      const buffer = Buffer.from(await response.arrayBuffer())
      return {
        ok: true,
        mimeType,
        extension: getExtensionFromMimeType(mimeType, getExtensionFromUrl(source)),
        buffer,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { ok: false, error: 'HiAPI did not return a usable image source.' }
}

function replaceExtension(value, nextExtension) {
  const extension = String(nextExtension ?? '').replace(/^\./, '')
  return value.replace(/\.[^.]+$/, `.${extension}`)
}

function summarizeText(value, maxLength = 108) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`
}

function buildLines(value, maxLineLength = 22, maxLines = 3) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''

  for (const word of words) {
    const proposal = current ? `${current} ${word}` : word
    if (proposal.length > maxLineLength && current) {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    } else {
      current = proposal
    }
  }

  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === 0) lines.push(String(value ?? '').slice(0, maxLineLength))
  return lines.slice(0, maxLines)
}

function chooseAccent(seed) {
  const accents = [
    { primary: '#dcb45c', secondary: '#f5e6b0', tertiary: '#8eb777' },
    { primary: '#7cc6ff', secondary: '#d8efff', tertiary: '#8eb777' },
    { primary: '#f093fb', secondary: '#ffd3ef', tertiary: '#b7d7a8' },
    { primary: '#7ce6cf', secondary: '#d4fff4', tertiary: '#dcb45c' },
  ]
  const hash = crypto.createHash('sha1').update(seed).digest()
  return accents[hash[0] % accents.length]
}

function buildPosterSvg({ eyebrow, title, summary, chips = [], steps = [], seed }) {
  const accent = chooseAccent(seed)
  const titleLines = buildLines(title, 18, 3)
  const summaryLines = buildLines(summary, 44, 3)
  const chipValues = chips.slice(0, 3)
  const stepValues = steps.slice(0, 3)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024" fill="none">
  <rect width="1536" height="1024" fill="#171717"/>
  <rect x="64" y="64" width="1408" height="896" rx="42" fill="#1f1f1f"/>
  <rect x="92" y="92" width="708" height="840" rx="28" fill="#242424"/>
  <rect x="830" y="92" width="614" height="840" rx="28" fill="#1b1b1b"/>
  <rect x="92" y="92" width="708" height="16" rx="8" fill="${accent.primary}" fill-opacity="0.95"/>
  <rect x="992" y="154" width="292" height="292" rx="32" fill="${accent.primary}" fill-opacity="0.18"/>
  <rect x="1064" y="226" width="292" height="292" rx="32" fill="${accent.secondary}" fill-opacity="0.16"/>
  <rect x="896" y="560" width="456" height="280" rx="32" fill="#262626"/>
  <text x="144" y="184" fill="${accent.tertiary}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="1.8">${escapeHtml(eyebrow)}</text>
  ${titleLines
    .map(
      (line, index) =>
        `<text x="144" y="${280 + index * 82}" fill="#f5f1e8" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="800">${escapeHtml(line)}</text>`,
    )
    .join('')}
  ${summaryLines
    .map(
      (line, index) =>
        `<text x="144" y="${540 + index * 42}" fill="#d8d0c1" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="400">${escapeHtml(line)}</text>`,
    )
    .join('')}
  ${chipValues
    .map((chip, index) => {
      const y = 710 + index * 72
      return `
        <rect x="144" y="${y - 34}" width="520" height="54" rx="27" fill="#2a2a2a"/>
        <circle cx="176" cy="${y - 8}" r="8" fill="${accent.primary}"/>
        <text x="200" y="${y}" fill="#f2eee6" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600">${escapeHtml(summarizeText(chip, 34))}</text>
      `
    })
    .join('')}
  <text x="896" y="160" fill="#f2eee6" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700">Workflow frame</text>
  ${stepValues
    .map((step, index) => {
      const y = 246 + index * 170
      return `
        <rect x="896" y="${y}" width="404" height="116" rx="24" fill="#242424"/>
        <rect x="922" y="${y + 26}" width="64" height="64" rx="18" fill="${accent.primary}" fill-opacity="0.88"/>
        <text x="944" y="${y + 68}" fill="#171717" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${index + 1}</text>
        <text x="1010" y="${y + 52}" fill="#f5f1e8" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700">${escapeHtml(summarizeText(step, 28))}</text>
      `
    })
    .join('')}
  <text x="896" y="620" fill="${accent.secondary}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600">Generated visual fallback</text>
  <text x="896" y="668" fill="#d8d0c1" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="500">The page can use this immediately,</text>
  <text x="896" y="712" fill="#d8d0c1" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="500">then upgrade to an API-backed image when</text>
  <text x="896" y="756" fill="#d8d0c1" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="500">an API key is available.</text>
</svg>
`
}

function buildPagePrompt(cluster, page) {
  const useCases = safeArray(page.useCaseModels)
    .map((item) => item.label)
    .filter(Boolean)
    .slice(0, 3)
  const sourceDomains = safeArray(page.sourceReferences)
    .map((item) => item.domain)
    .filter(Boolean)
    .slice(0, 3)
  const assetTitle = page.assetBinding?.primary?.title ?? cluster.label
  const audience = cluster.audience ?? 'operators evaluating an AI workflow'

  const sceneByType = {
    hub: 'a product marketing decision desk with a laptop, shortlist cards, workflow notes, and short-form demo storyboard frames',
    workflow:
      'a realistic workflow board showing source screenshots, prompt notes, a review loop, and an export-ready short-form demo timeline',
    'use-cases':
      'a three-panel scene showing a product demo clip, a launch update clip, and a screenshot-to-video clip for a SaaS team',
    'template-kit':
      'a tidy workspace with a prompt pack, checklist, comparison worksheet, and reusable review notes laid out like a real team handoff kit',
    'case-study':
      'a before-and-after operations wall with messy research tabs on one side and a clean reusable workflow pack on the other',
  }

  const scene =
    sceneByType[page.type] ??
    'a clean editorial product workspace with AI workflow planning materials and short-form demo frames'

  return [
    `Create a polished website hero image for a page about ${cluster.primaryKeyword}.`,
    `Scene: ${scene}.`,
    `Audience: ${audience}.`,
    useCases.length > 0 ? `Show cues for these use cases: ${useCases.join(', ')}.` : '',
    sourceDomains.length > 0
      ? `Ground the visual in real product-marketing research rather than fantasy art; subtle UI inspiration can echo ${sourceDomains.join(', ')} without showing brand logos.`
      : '',
    `The page CTA asset is ${assetTitle}.`,
    'Style: realistic editorial product scene, crisp composition, warm neutral lighting, high trust, modern SaaS operator aesthetic, landscape, no giant text, no brand names, no watermark, no surreal effects.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buildAssetPrompt(cluster, asset) {
  const useCases = safeArray(asset.useCaseLabels).slice(0, 3)
  const deliverables = safeArray(asset.deliverables)
    .map((item) => item.label)
    .filter(Boolean)
    .slice(0, 4)

  const kitSceneByKind = {
    template_pack:
      'a realistic prompt pack cover scene with storyboard cards, hook notes, transition prompts, and product screenshots on a desk',
    checklist:
      'a workflow checklist scene with an annotated launch board, owner notes, and a product demo review checklist',
    worksheet:
      'a comparison worksheet scene with option columns, scoring notes, time-to-value comparisons, and review criteria laid out clearly',
  }

  const scene =
    kitSceneByKind[asset.assetKind] ??
    'a clean digital asset cover showing reusable workflow materials for a product-marketing team'

  return [
    `Create a conversion-focused asset cover image for ${asset.title}.`,
    `Scene: ${scene}.`,
    `This belongs to the thesis ${cluster.label} around ${cluster.primaryKeyword}.`,
    useCases.length > 0 ? `The strongest use cases are ${useCases.join(', ')}.` : '',
    deliverables.length > 0 ? `Hint at these modules: ${deliverables.join(', ')}.` : '',
    'Style: realistic workspace, premium but grounded, crisp props, easy to trust, modern SaaS visuals, landscape, no brand logos, no fake UI text walls, no watermark.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buildPageAlt(cluster, page) {
  const useCase = safeArray(page.useCaseModels)
    .map((item) => item.label)
    .find(Boolean)
  if (useCase) {
    return `${cluster.label} hero visual showing an ${cluster.primaryKeyword} workflow for ${useCase}.`
  }
  return `${cluster.label} hero visual showing an ${cluster.primaryKeyword} workflow and planning surface.`
}

function buildAssetAlt(cluster, asset) {
  return `${asset.title} cover visual showing reusable ${cluster.primaryKeyword} workflow materials.`
}

function buildPageFallbackPlan(cluster, page) {
  const chips = dedupe([
    ...safeArray(page.useCaseModels).map((item) => item.label),
    ...(page.assetBinding?.primary?.title ? [page.assetBinding.primary.title] : []),
  ]).slice(0, 3)

  const steps =
    page.type === 'workflow'
      ? safeArray(page.stepItems).map((item) => item.title).filter(Boolean).slice(0, 3)
      : safeArray(page.examples).map((item) => item.title).filter(Boolean).slice(0, 3)

  return buildPosterSvg({
    eyebrow: `${cluster.label} / ${page.navLabel ?? page.slug}`,
    title: page.h1 ?? page.title,
    summary: summarizeText(page.intro ?? page.metaDescription, 108),
    chips,
    steps,
    seed: `${cluster.siteSlug}:${page.slug}`,
  })
}

function buildAssetFallbackPlan(cluster, asset) {
  const chips = dedupe([
    ...safeArray(asset.useCaseLabels),
    ...safeArray(asset.deliverables).map((item) => item.label),
  ]).slice(0, 3)
  const steps = safeArray(asset.deliverySteps).map((item) => item.title).filter(Boolean).slice(0, 3)

  return buildPosterSvg({
    eyebrow: `${cluster.label} / asset`,
    title: asset.title,
    summary: summarizeText(asset.summary, 108),
    chips,
    steps,
    seed: `${cluster.siteSlug}:${asset.slug}`,
  })
}

function targetPageEnabled(pageType) {
  return imageConfig.pageTypes.includes(pageType)
}

function targetAssetEnabled(assetKind) {
  return imageConfig.assetKinds.includes(assetKind)
}

async function generateOpenAiImage({ prompt, size }) {
  const models = [imageConfig.model, ...imageConfig.fallbackModels].filter(Boolean)
  let lastError = null

  for (const model of models) {
    try {
      const response = await fetch(`${imageConfig.apiBaseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imageConfig.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality: imageConfig.quality,
          output_format: imageConfig.outputFormat,
          background: imageConfig.background,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      const imageRecord = safeArray(payload?.data)[0]
      const base64 = imageRecord?.b64_json

      if (response.ok && base64) {
        return {
          ok: true,
          provider: 'openai',
          model,
          extension: imageConfig.outputFormat,
          buffer: Buffer.from(base64, 'base64'),
          revisedPrompt: imageRecord?.revised_prompt ?? null,
        }
      }

      lastError = payload?.error?.message ?? `Image generation failed for ${model} (${response.status}).`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: false,
    error: lastError ?? 'Image generation failed.',
  }
}

async function generateHiApiImage({ prompt, size }) {
  const models = [imageConfig.model, ...imageConfig.fallbackModels].filter(Boolean)
  const imageConfigBody = getHiApiImageConfig(size)
  let lastError = null

  for (const model of models) {
    try {
      const response = await fetch(`${imageConfig.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imageConfig.apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
          extra_body: {
            google: {
              image_config: imageConfigBody,
            },
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      const messageContent = collectChatContentText(payload?.choices?.[0]?.message?.content)
      const imageSources = extractMarkdownImageSources(messageContent)

      if (response.ok && imageSources.length > 0) {
        for (const source of imageSources) {
          const imageResult = await fetchImageBufferFromSource(source)
          if (imageResult.ok) {
            return {
              ok: true,
              provider: 'hiapi',
              model,
              extension: imageResult.extension,
              buffer: imageResult.buffer,
              revisedPrompt: null,
            }
          }
          lastError = imageResult.error
        }
      } else if (response.ok) {
        lastError = 'HiAPI returned a completion but no markdown image content.'
      } else {
        lastError =
          payload?.error?.message ??
          payload?.message ??
          `HiAPI image generation failed for ${model} (${response.status}).`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: false,
    error: lastError ?? 'HiAPI image generation failed.',
  }
}

async function generateImage(request) {
  if (imageConfig.provider === 'hiapi') {
    return generateHiApiImage(request)
  }
  return generateOpenAiImage(request)
}

function buildManifestEntry({ plan, promptHash, webPath, mode, model, prompt, revisedPrompt, alt }) {
  return {
    id: plan.id,
    kind: plan.kind,
    slug: plan.slug,
    title: plan.title,
    role: plan.role,
    mode,
    model,
    promptHash,
    prompt,
    revisedPrompt: revisedPrompt ?? null,
    url: webPath,
    alt,
    generatedAt: new Date().toISOString(),
  }
}

function toVisualAsset(entry, baseUrl) {
  return {
    id: entry.id,
    kind: entry.kind,
    slug: entry.slug,
    role: entry.role,
    mode: entry.mode,
    model: entry.model,
    src: `media/${path.posix.basename(entry.url)}`,
    url: entry.url,
    canonicalUrl: new URL(entry.url, `${baseUrl}/`).toString(),
    alt: entry.alt,
  }
}

async function materializePlan(plan, previousById, baseUrl) {
  const promptHash = crypto
    .createHash('sha1')
    .update(`${imageConfig.promptVersion}:${plan.prompt}:${plan.alt}:${plan.size}`)
    .digest('hex')
  const previous = previousById.get(plan.id)
  const priorLocalPath = previous?.url ? path.join(plan.siteDir, previous.url.split(`/generated-sites/${plan.siteSlug}/`).pop() ?? '') : null
  const targetMode = imageConfig.canGenerate ? imageConfig.provider : 'fallback'

  if (
    previous &&
    previous.promptHash === promptHash &&
    previous.mode === targetMode &&
    previous.url &&
    priorLocalPath &&
    existsSync(priorLocalPath)
  ) {
    return {
      entry: previous,
      visualAsset: toVisualAsset(previous, baseUrl),
    }
  }

  let entry = null

  if (imageConfig.canGenerate) {
    const result = await generateImage({ prompt: plan.prompt, size: plan.size })
    if (result.ok) {
      const generatedPath = replaceExtension(plan.generatedPath, result.extension)
      const generatedWebPath = replaceExtension(plan.generatedWebPath, result.extension)
      await writeFile(generatedPath, result.buffer)
      entry = buildManifestEntry({
        plan,
        promptHash,
        webPath: generatedWebPath,
        mode: result.provider,
        model: result.model,
        prompt: plan.prompt,
        revisedPrompt: result.revisedPrompt,
        alt: plan.alt,
      })
    }
  }

  if (!entry) {
    await writeFile(plan.fallbackPath, plan.fallbackSvg, 'utf8')
    entry = buildManifestEntry({
      plan,
      promptHash,
      webPath: plan.fallbackWebPath,
      mode: 'fallback',
      model: 'fallback-svg',
      prompt: plan.prompt,
      alt: plan.alt,
    })
  }

  return {
    entry,
    visualAsset: toVisualAsset(entry, baseUrl),
  }
}

export async function buildSiteVisualAssets({
  baseUrl,
  siteDir,
  siteArtifactsDir,
  cluster,
  pages,
  conversionAssets,
}) {
  const mediaDir = path.join(siteDir, 'media')
  await mkdir(mediaDir, { recursive: true })
  const manifestPath = path.join(siteArtifactsDir, 'visual-assets.json')
  const previousManifest = await readJsonIfExists(manifestPath, { items: [] })
  const previousById = new Map(safeArray(previousManifest?.items).map((item) => [item.id, item]))
  const pageVisuals = {}
  const assetVisuals = {}
  const items = []
  const plans = []

  for (const page of safeArray(pages)) {
    if (!targetPageEnabled(page.type)) continue
    const fileStem = `${slugify(page.slug)}-hero`
    plans.push({
      id: `page:${page.slug}`,
      kind: 'page',
      slug: page.slug,
      role: 'hero',
      title: page.title,
      prompt: buildPagePrompt(cluster, page),
      alt: buildPageAlt(cluster, page),
      size: imageConfig.heroSize,
      siteDir,
      siteSlug: cluster.siteSlug,
      generatedPath: path.join(mediaDir, `${fileStem}.${imageConfig.outputFormat}`),
      fallbackPath: path.join(mediaDir, `${fileStem}.svg`),
      generatedWebPath: `/generated-sites/${cluster.siteSlug}/media/${fileStem}.${imageConfig.outputFormat}`,
      fallbackWebPath: `/generated-sites/${cluster.siteSlug}/media/${fileStem}.svg`,
      fallbackSvg: buildPageFallbackPlan(cluster, page),
    })
  }

  for (const asset of safeArray(conversionAssets)) {
    if (!targetAssetEnabled(asset.assetKind)) continue
    const fileStem = `${slugify(asset.slug)}-cover`
    plans.push({
      id: `asset:${asset.slug}`,
      kind: 'asset',
      slug: asset.slug,
      role: 'cover',
      title: asset.title,
      prompt: buildAssetPrompt(cluster, asset),
      alt: buildAssetAlt(cluster, asset),
      size: imageConfig.assetSize,
      siteDir,
      siteSlug: cluster.siteSlug,
      generatedPath: path.join(mediaDir, `${fileStem}.${imageConfig.outputFormat}`),
      fallbackPath: path.join(mediaDir, `${fileStem}.svg`),
      generatedWebPath: `/generated-sites/${cluster.siteSlug}/media/${fileStem}.${imageConfig.outputFormat}`,
      fallbackWebPath: `/generated-sites/${cluster.siteSlug}/media/${fileStem}.svg`,
      fallbackSvg: buildAssetFallbackPlan(cluster, asset),
    })
  }

  for (const plan of plans) {
    const result = await materializePlan(plan, previousById, baseUrl)
    items.push(result.entry)
    if (plan.kind === 'page') {
      pageVisuals[plan.slug] = result.visualAsset
    } else {
      assetVisuals[plan.slug] = result.visualAsset
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: imageConfig.canGenerate ? imageConfig.provider : 'fallback',
    enabled: imageConfig.enabled,
    canGenerate: imageConfig.canGenerate,
    model: imageConfig.model,
    pageTypes: imageConfig.pageTypes,
    assetKinds: imageConfig.assetKinds,
    items,
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    pageVisuals,
    assetVisuals,
    manifest,
  }
}
