import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const projectRoot = path.resolve(__dirname, '..')
const defaultManifestPath = path.join(projectRoot, 'config', 'route-manifest.json')
const allowedKinds = new Set(['core', 'support', 'asset', 'confirmation', 'consult', 'commercial'])

export function normalizeRoutePath(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '/') return '/'
  let pathname = raw
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname
  } catch {
    pathname = raw
  }
  const cleaned = pathname.replace(/^\/+|\/+$/g, '')
  return cleaned ? `/${cleaned}/` : '/'
}

function fail(source, message) {
  throw new Error(`Invalid route manifest (${source}): ${message}`)
}

export function validateRouteManifest(input, options = {}) {
  const source = options.source ?? 'config/route-manifest.json'
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(source, 'expected a JSON object.')
  if (!Number.isInteger(input.version) || input.version < 1) fail(source, 'version must be a positive integer.')
  if (!String(input.siteSlug ?? '').trim()) fail(source, 'siteSlug is required.')

  let baseUrl
  try {
    baseUrl = new URL(input.baseUrl)
  } catch {
    fail(source, 'baseUrl must be an absolute HTTP(S) URL.')
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.pathname !== '/') {
    fail(source, 'baseUrl must be an origin without a path.')
  }

  if (!Array.isArray(input.productionRoutes) || input.productionRoutes.length === 0) {
    fail(source, 'productionRoutes must be a non-empty array.')
  }
  if (!Array.isArray(input.excludedProductionPrefixes) || input.excludedProductionPrefixes.length === 0) {
    fail(source, 'excludedProductionPrefixes must be a non-empty array.')
  }

  const routePaths = new Set()
  const intents = new Set()
  const pageTypes = new Set()
  const normalizedRoutes = input.productionRoutes.map((route, index) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) fail(source, `productionRoutes[${index}] must be an object.`)
    const routePath = normalizeRoutePath(route.path)
    if (route.path !== routePath) fail(source, `route path ${route.path ?? '(missing)'} must use canonical directory form ${routePath}.`)
    if (routePaths.has(routePath)) fail(source, `duplicate production route ${routePath}.`)
    routePaths.add(routePath)
    if (!allowedKinds.has(route.kind)) fail(source, `${routePath} has unsupported kind ${route.kind ?? '(missing)'}.`)
    if (typeof route.indexable !== 'boolean') fail(source, `${routePath} must declare indexable.`)
    if (typeof route.monitoring !== 'boolean') fail(source, `${routePath} must declare monitoring eligibility.`)
    if (typeof route.analytics !== 'boolean') fail(source, `${routePath} must declare analytics eligibility.`)
    if (route.monitoring && !route.indexable) fail(source, `${routePath} cannot be monitored while non-indexable.`)
    if (!String(route.intent ?? '').trim()) fail(source, `${routePath} must declare intent.`)
    if (intents.has(route.intent)) fail(source, `duplicate route intent ${route.intent}.`)
    intents.add(route.intent)

    const normalizedPageTypes = Array.isArray(route.pageTypes) ? route.pageTypes : []
    for (const pageType of normalizedPageTypes) {
      if (!String(pageType ?? '').trim()) fail(source, `${routePath} contains an empty page type.`)
      if (pageTypes.has(pageType)) fail(source, `page type ${pageType} is assigned to more than one route.`)
      pageTypes.add(pageType)
    }

    return {
      ...route,
      path: routePath,
      pageTypes: normalizedPageTypes,
    }
  })

  const excludedPrefixes = input.excludedProductionPrefixes.map((prefix) => {
    const normalized = normalizeRoutePath(prefix)
    if (prefix !== normalized || normalized === '/') fail(source, `excluded prefix ${prefix ?? '(missing)'} is invalid.`)
    return normalized
  })
  if (new Set(excludedPrefixes).size !== excludedPrefixes.length) fail(source, 'excluded production prefixes must be unique.')

  for (const route of normalizedRoutes) {
    const blockedPrefix = excludedPrefixes.find((prefix) => route.path.startsWith(prefix))
    if (blockedPrefix) fail(source, `${route.path} is under excluded prefix ${blockedPrefix}.`)
    if (route.indexable && !route.ctaHref) fail(source, `${route.path} must declare a CTA target.`)
    if (route.ctaHref) {
      const ctaHref = normalizeRoutePath(route.ctaHref)
      if (route.ctaHref !== ctaHref || !routePaths.has(ctaHref)) {
        fail(source, `CTA target ${route.ctaHref} for ${route.path} is not a declared production route.`)
      }
      route.ctaHref = ctaHref
    }
  }

  const rootRoute = normalizedRoutes.find((route) => route.path === '/')
  if (!rootRoute?.monitoring || !rootRoute?.analytics) {
    fail(source, 'root route must enable monitoring and analytics.')
  }

  return {
    ...input,
    baseUrl: baseUrl.origin,
    productionRoutes: normalizedRoutes,
    excludedProductionPrefixes: excludedPrefixes,
  }
}

export function loadRouteManifest(filePath = defaultManifestPath) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to load route manifest ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return validateRouteManifest(parsed, { source: filePath })
}

export function getProductionRoutes(options = {}) {
  const manifest = options.manifest ?? loadRouteManifest(options.filePath)
  return options.indexableOnly
    ? manifest.productionRoutes.filter((route) => route.indexable)
    : manifest.productionRoutes
}

export function getIndexableProductionPaths(options = {}) {
  return getProductionRoutes({ ...options, indexableOnly: true }).map((route) => route.path)
}

export function getMonitoringPaths(options = {}) {
  return getProductionRoutes(options).filter((route) => route.monitoring).map((route) => route.path)
}

export function getAnalyticsPaths(options = {}) {
  return getProductionRoutes(options).filter((route) => route.analytics).map((route) => route.path)
}

export function getExcludedProductionPrefixes(options = {}) {
  const manifest = options.manifest ?? loadRouteManifest(options.filePath)
  return [...manifest.excludedProductionPrefixes]
}

export function getProductionRouteByIntent(intent, options = {}) {
  const route = getProductionRoutes(options).find((item) => item.intent === intent)
  if (!route) throw new Error(`Route intent ${intent} is not declared in config/route-manifest.json.`)
  return route
}

export function getProductionRoute(routePath, options = {}) {
  const normalized = normalizeRoutePath(routePath)
  return getProductionRoutes(options).find((route) => route.path === normalized) ?? null
}

export function getProductionPathForPageType(pageType, options = {}) {
  const route = getProductionRoutes(options).find((item) => item.pageTypes.includes(pageType))
  if (!route) throw new Error(`Page type ${pageType} is not declared in config/route-manifest.json.`)
  return route.path
}

export function getAssetRoutePaths(assetSlug, options = {}) {
  const routes = getProductionRoutes(options).filter((route) => route.assetSlug === assetSlug)
  const landing = routes.find((route) => route.kind === 'asset')
  const confirmation = routes.find((route) => route.kind === 'confirmation')
  if (!landing || !confirmation) throw new Error(`Asset ${assetSlug} must declare landing and confirmation routes in config/route-manifest.json.`)
  return { landingPath: landing.path, thankYouPath: confirmation.path }
}

export function getOfferRoutePaths(offerSlug, options = {}) {
  const routes = getProductionRoutes(options).filter((route) => route.offerSlug === offerSlug)
  const landing = routes.find((route) => route.kind === 'consult')
  const confirmation = routes.find((route) => route.kind === 'confirmation')
  if (!landing || !confirmation) throw new Error(`Offer ${offerSlug} must declare landing and confirmation routes in config/route-manifest.json.`)
  return { landingPath: landing.path, thankYouPath: confirmation.path }
}

export function resolvePageIntentContracts(pageIntents, options = {}) {
  const manifest = options.manifest ?? loadRouteManifest(options.filePath)
  return pageIntents.map((intent) => {
    const route = getProductionRoutes({ manifest }).find((item) => item.pageTypes.includes(intent.pageType))
    if (!route) throw new Error(`Page intent ${intent.pageType} has no route in config/route-manifest.json.`)
    if (intent.path && normalizeRoutePath(intent.path) !== route.path) {
      throw new Error(`Page intent ${intent.pageType} path ${intent.path} conflicts with route manifest path ${route.path}.`)
    }
    if (intent.presentation?.primaryCtaHref && normalizeRoutePath(intent.presentation.primaryCtaHref) !== route.ctaHref) {
      throw new Error(`Page intent ${intent.pageType} CTA ${intent.presentation.primaryCtaHref} conflicts with route manifest CTA ${route.ctaHref}.`)
    }
    return {
      ...intent,
      path: route.path,
      indexable: route.indexable,
      presentation: {
        ...intent.presentation,
        primaryCtaHref: route.ctaHref,
      },
    }
  })
}

export function isProductionRoutePath(routePath, options = {}) {
  const normalized = normalizeRoutePath(routePath)
  return new Set(getProductionRoutes(options).map((route) => route.path)).has(normalized)
}

export function routeToUrl(routePath, baseUrl) {
  return new URL(normalizeRoutePath(routePath), `${String(baseUrl || '').replace(/\/+$/, '')}/`).toString()
}

export function assertProductionUrl(urlOrPath, options = {}) {
  const manifest = options.manifest ?? loadRouteManifest(options.filePath)
  const raw = String(urlOrPath ?? '')
  if (/^https?:\/\//i.test(raw)) {
    try {
      if (new URL(raw).origin !== manifest.baseUrl) {
        return { ok: false, reason: `URL ${raw} does not use production origin ${manifest.baseUrl}.` }
      }
    } catch {
      return { ok: false, reason: `URL ${raw} is invalid.` }
    }
  }
  const pathName = normalizeRoutePath(raw)
  const blockedPrefix = manifest.excludedProductionPrefixes.find((prefix) => pathName.startsWith(prefix))
  if (blockedPrefix) {
    return { ok: false, reason: `Route ${pathName} is under excluded production prefix ${blockedPrefix}.` }
  }
  const ok = isProductionRoutePath(pathName, { manifest })
  return { ok, reason: ok ? '' : `Route ${pathName} is not listed in config/route-manifest.json.` }
}

export function filterProductionUrls(urls, options = {}) {
  const manifest = options.manifest ?? loadRouteManifest(options.filePath)
  const indexablePaths = new Set(getIndexableProductionPaths({ manifest }))
  const blockedPaths = new Set((options.blockedPaths ?? []).map(normalizeRoutePath))
  return [...new Set(urls)].filter((url) => {
    const routePath = normalizeRoutePath(url)
    return assertProductionUrl(url, { manifest }).ok && indexablePaths.has(routePath) && !blockedPaths.has(routePath)
  })
}
