#!/usr/bin/env node
/**
 * Contract-driven public copy rewrite pass.
 * Reads experiment + page-intents and rewrites production HTML surfaces so
 * subsequent pipeline runs that call this pass stay thesis-aligned.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getPageIntent,
  loadPageIntents,
  normalizePublicPath,
  resolvePublicHtmlPath,
} from './page-intent-contract.mjs'
import {
  getThesisContract,
  loadExperiment,
  projectRoot,
  safeArray,
} from './thesis-contract.mjs'

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

const PAGE_COPY = {
  '/': {
    title: 'AI product demo video workflow for SaaS teams',
    description:
      'Turn product screenshots, screen recordings, and feature updates into a 15-60 second SaaS product demo video. Built for founders, product marketers, and indie hackers.',
    h1: 'Turn product screenshots and feature updates into a short SaaS demo video',
    lede: 'Choose the right AI video tool, structure the shots, fix failed generations, and publish a usable product demo without wasting credits on broad experimentation.',
    eyebrow: 'AI product demo workflow for SaaS teams',
  },
  '/workflow/': {
    title: 'AI product demo video workflow: 5 operator steps',
    description:
      'Operator playbook for SaaS product demos: inputs, actions, outputs, owners, failure modes, and review checkpoints from screenshot to publish.',
    h1: 'Run a 5-step product demo pilot without burning the first credits',
    lede: 'For SaaS founders and product marketers: take product screenshots or a feature update, shortlist tools for product demos, repair the broken shot, and hand off a reusable product demo workflow.',
  },
  '/compare/': {
    title: 'Best AI video tools for product demos: Runway first, Pika fallback',
    description:
      'Compare AI video tools for SaaS product demos—not generic film. Start with Runway, keep Pika as fallback, and only switch after a written failure reason.',
    h1: 'Pick the first product-demo tool in 10 minutes—not four half-tests',
    lede: 'For product demos, start with Runway for a usable short result, keep Pika as the only fallback, and park other tools until you can write why the first tool failed on UI, text, or motion.',
  },
  '/pricing/': {
    title: 'AI product demo video pricing: credits vs review cost',
    description:
      'Budget SaaS product demo video cost beyond plan names: generation credits, failed retries, human review, and when paid workflow is worth it.',
    h1: 'Price a product demo pilot as credits plus 30–90 minutes of review',
    lede: 'Sticker prices hide the real SaaS demo bill: regenerations, approvals, and handoff. Anchor a first pilot, then decide if paid seats buy workflow control.',
  },
  '/free-vs-paid/': {
    title: 'Free vs paid AI tools for SaaS product demos',
    description:
      'Know when free AI tools are enough for one product demo clip, and when paid workflow controls beat more generation credits.',
    h1: 'Stay free for one product demo—pay when review becomes the product',
    lede: 'Free is enough for one operator and one 15-60 second SaaS demo. Upgrade when shared review, reuse, and weekly feature launches need structure—not because a pricing page looks busy.',
  },
  '/use-cases/': {
    title: 'SaaS product demo video use cases',
    description:
      'Allowed product-demo scenarios only: feature launch, Product Hunt, changelog, onboarding walkthrough, homepage demo, and sales enablement.',
    h1: 'Six SaaS product demo scenarios—and nothing outside the product job',
    lede: 'Use this page to pick one product-demo job: feature launch, Product Hunt, product update, onboarding walkthrough, homepage demo, or sales enablement. Scenarios outside the SaaS product job are out of scope.',
  },
  '/templates/': {
    title: 'Product demo video templates and workflow pack',
    description:
      'Blank and filled product demo assets: prompt pack, shot planner, checklist, and comparison worksheet for SaaS teams.',
    h1: 'Open a product demo template you can start in three minutes',
    lede: 'Working product-demo assets with blank and filled examples—screenshot inputs, shot lists, CTA framing, and review notes for the next feature launch.',
  },
  '/case-study/': {
    title: 'Product demo video worked example',
    description:
      'Worked example / internal test of a SaaS product demo sequence: before, after, what failed, and what changed. Not a fabricated customer case study.',
    h1: 'Worked example: before/after on a SaaS product demo sequence',
    lede: 'Labeled worked example / internal test—not a fake customer story. See what failed in the first generation, what changed in the repair pass, and what shipped as a short product demo.',
  },
  '/faq/': {
    title: 'AI product demo video FAQ',
    description: 'Answers for SaaS founders and product marketers starting a product demo video pilot.',
    h1: 'Product demo video FAQ for SaaS teams',
    lede: 'Clear blockers before your first product demo pilot—tools, costs, failure modes, and when to hire help.',
  },
  '/best-tools/': {
    title: 'Best AI tools for SaaS product demo videos',
    description: 'Shortlist AI tools for product demos and feature launch clips—not a generic AI video generator directory.',
    h1: 'Best AI tools for product demos, not generic AI video',
    lede: 'A shortlist for SaaS product demos and feature launches. Judge tools on UI/text handling, credit burn, and review friction.',
  },
  '/prompt-pack/': {
    title: 'SaaS Product Demo Video Workflow Pack',
    description:
      'Download the Product Demo Workflow Pack: intake brief, 4-6 scene shot list, CTA framing, repair prompts, and review rubric for SaaS demos.',
    h1: 'Product Demo Workflow Pack for a publish-ready SaaS clip',
    lede: 'Turn one product screenshot set or feature update into a short demo without rebuilding the brief. Built for founders, product marketers, and indie hackers.',
  },
  '/audit/': {
    title: 'Product demo workflow audit',
    description: 'Request a focused audit of your SaaS product demo video workflow.',
    h1: 'Product demo workflow audit for SaaS teams',
    lede: 'When the shortlist is stuck or review burn is high, request a focused product-demo workflow audit.',
  },
  '/guides/ai-video-diy-vs-freelancer/': {
    title: 'DIY vs hire for SaaS product demo videos',
    description: 'Make a SaaS product demo video yourself vs hire a freelancer—decision criteria for founders and marketers.',
    h1: 'Make the SaaS product demo yourself vs hire a freelancer',
    lede: 'Choose DIY when one operator can finish a 15-60 second product demo pilot. Hire when launch deadlines and review load exceed the team.',
  },
  '/cost/ai-video-production-cost/': {
    title: 'Cost to produce a SaaS product demo video',
    description: 'Cost to produce a 15-60 second SaaS product demo video including credits, retries, and review time.',
    h1: 'What a 15-60 second SaaS product demo really costs',
    lede: 'Budget generation credits, failed retries, and 30–90 minutes of review before you compare plan names.',
  },
  '/hire/ai-video-editor/': {
    title: 'Hire an editor for SaaS product demo videos',
    description: 'Hire an editor for a SaaS product demo or feature launch video when DIY review load is too high.',
    h1: 'Hire an editor for a product demo or feature launch video',
    lede: 'When DIY fails on deadline or polish, hire for a product demo / feature launch cut—not a generic entertainment edit.',
  },
}

function replaceTagContent(html, tag, content) {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'i')
  if (!re.test(html)) return html
  return html.replace(re, `<${tag}>${content}</${tag}>`)
}

function replaceMeta(html, name, content) {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`, 'i')
  if (re.test(html)) return html.replace(re, `<meta name="${name}" content="${escapeAttr(content)}" />`)
  return html
}

function replaceOg(html, property, content) {
  const re = new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]*"\\s*/?>`, 'i')
  if (re.test(html)) return html.replace(re, `<meta property="${property}" content="${escapeAttr(content)}" />`)
  return html
}

function replaceTwitter(html, name, content) {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`, 'i')
  if (re.test(html)) return html.replace(re, `<meta name="${name}" content="${escapeAttr(content)}" />`)
  return html
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function rewriteOgImageToMedia(html) {
  return html.replace(
    /content="https:\/\/automiora\.com\/generated-sites\/[^"]+"/gi,
    'content="https://automiora.com/media/index-hero.png"',
  ).replace(
    /content="\/generated-sites\/[^"]+"/gi,
    'content="/media/index-hero.png"',
  )
}

function rewriteCtas(html, intent) {
  if (!intent) return html
  let next = html
  const primary = intent.primaryCta
  const secondary = intent.secondaryCta
  if (primary?.href) {
    // first cta-button
    let primaryDone = false
    next = next.replace(
      /(<a\b[^>]*class="[^"]*cta-button[^"]*"[^>]*href=")([^"]*)("[^>]*>)([\s\S]*?)(<\/a>)/i,
      (full, a, href, b, label, c) => {
        if (primaryDone) return full
        primaryDone = true
        return `${a}${primary.href}${b}${primary.label || label}${c}`
      },
    )
  }
  if (secondary?.href) {
    let secondaryDone = false
    next = next.replace(
      /(<a\b[^>]*class="[^"]*secondary-cta[^"]*"[^>]*href=")([^"]*)("[^>]*>)([\s\S]*?)(<\/a>)/i,
      (full, a, href, b, label, c) => {
        if (secondaryDone) return full
        secondaryDone = true
        return `${a}${secondary.href}${b}${secondary.label || label}${c}`
      },
    )
    // inject secondary if missing on free-vs-paid style heroes
    if (!/class="[^"]*secondary-cta[^"]*"/.test(next) && /class="hero-actions"/.test(next)) {
      next = next.replace(
        /(<div class="hero-actions">[\s\S]*?)(<\/div>)/i,
        `$1<a class="secondary-cta" href="${secondary.href}" data-ga4-event="consult_click" data-ga4-label="${escapeAttr(secondary.label)}">${secondary.label}</a>\n    $2`,
      )
    }
  }
  return next
}

function injectThesisBanner(html, pathName) {
  if (html.includes('data-thesis-contract="video-creation"')) return html
  const note = `<!-- thesis-contract:video-creation path:${pathName} -->`
  return html.replace('<body', `${note}\n  <body data-thesis-contract="video-creation"`)
}

function strengthenCaseStudyLabel(html, pathName) {
  if (!/case-study/i.test(pathName)) return html
  if (/\bworked example\b/i.test(html) || /\binternal test\b/i.test(html)) return html
  return html.replace(
    /<p class="lede">([\s\S]*?)<\/p>/i,
    `<p class="lede">Worked example / internal test: $1</p>`,
  )
}

export async function applyThesisPublicRewrite(options = {}) {
  const experiment = options.experiment ?? loadExperiment()
  const contract = getThesisContract(experiment)
  const intents = options.intents ?? loadPageIntents()
  const updated = []

  for (const intent of safeArray(intents.pages)) {
    const publicPath = normalizePublicPath(intent.path)
    const filePath = resolvePublicHtmlPath(publicPath)
    let html
    try {
      html = await readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const copy = PAGE_COPY[publicPath] ?? {
      title: `${intent.job || contract.thesisLabel}`,
      description: safeArray(intent.primaryQueryCluster).slice(0, 2).join(' · '),
      h1: intent.job || contract.primaryOutcome,
      lede: `${contract.targetAudience}. Inputs: ${safeArray(contract.primaryInputs).slice(0, 3).join(', ')}. Outcome: ${safeArray(contract.primaryOutputs)[0]}.`,
    }

    let next = html
    next = replaceTagContent(next, 'title', copy.title)
    next = replaceMeta(next, 'description', copy.description)
    next = replaceOg(next, 'og:title', copy.title)
    next = replaceOg(next, 'og:description', copy.description)
    next = replaceTwitter(next, 'twitter:title', copy.title)
    next = replaceTwitter(next, 'twitter:description', copy.description)
    next = next.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${copy.h1}</h1>`)
    if (copy.lede) {
      if (/class="lede"/.test(next)) {
        next = next.replace(/<p class="lede">[\s\S]*?<\/p>/i, `<p class="lede">${copy.lede}</p>`)
      } else if (/class="kicker"/.test(next) && publicPath === '/prompt-pack/') {
        next = next.replace(/<p class="lede">[\s\S]*?<\/p>/i, `<p class="lede">${copy.lede}</p>`)
      }
    }
    if (copy.eyebrow) {
      next = next.replace(
        /<p class="eyebrow">[\s\S]*?<\/p>/i,
        `<p class="eyebrow">${copy.eyebrow}</p>`,
      )
    }
    next = rewriteCtas(next, intent)
    next = rewriteOgImageToMedia(next)
    next = strengthenCaseStudyLabel(next, publicPath)
    next = injectThesisBanner(next, publicPath)

    // Soften remaining generic portal phrases on high-value pages
    next = next
      .replace(/AI Video Workflow/g, 'AI Product Demo Workflow')
      .replace(/Create an AI video/gi, 'Create a product demo video')
      .replace(/short-form product demo videos/gi, 'SaaS product demo videos')
      .replace(/content operators shipping short-form product\/demo videos/gi, 'SaaS founders, product marketers, and indie hackers')

    if (next !== html) {
      await writeFile(filePath, next)
      updated.push(publicPath)
    }
  }

  return { updated, count: updated.length }
}

async function main() {
  const result = await applyThesisPublicRewrite()
  console.log(JSON.stringify(result, null, 2))
}

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
