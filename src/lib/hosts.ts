/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so the same bundle
 * addresses `http://localhost:4022` when served from localhost and `https://tessera.<apex>` when
 * served from the apex. Nothing here reads a build-time constant; see the note in vite.config.ts.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE PART THAT IS NOT LIKE THE OTHER FRONTENDS, AND WHY IT IS A CORRECTION RATHER THAN A GUESS
 *
 * `@cloudsforge/ui`'s surface registry has no `tessera` key. `SurfaceKey`
 * (`ui/packages/ui/src/surfaces.ts:23-36`) enumerates every addressable surface and Tessera is not
 * among them, because Tessera joined the programme after the registry was written
 * (docs/ecosystem/23-tessera.md). §10.2 lists the registry row as a REQUIRED edit to `micro-ui`
 * — `subdomain: 'tessera'`, `devPort: 4022`, `accent: '#6d9a49'`, `inSwitcher: false` — and
 * `micro-ui` is not this repository's to edit.
 *
 * So the host is DERIVED from a registry entry rather than declared, exactly as
 * `micro-emberkin-web` did before its own row landed. The derivation adds the two facts the
 * registry does not carry — the subdomain `tessera` and the dev port 4022 — and takes everything
 * else, including the whole localhost-versus-apex decision, from the registry's answer.
 *
 * ── And the second half, which is a real defect rather than an inconvenience ───────────────────
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain from the browser's
 * hostname, and `KNOWN_SUBS` is built from the registry's own subdomains. `tessera` is not one of
 * them, so an unknown prefix is left alone — which is correct for a preview deployment at
 * `pr-42.example.dev` and WRONG for this app in production. Served from `https://tessera.<apex>`
 * the registry resolves:
 *
 *     nimbus  → https://nimbus.tessera.<apex>     ← does not exist
 *     pay     → https://pay.tessera.<apex>        ← does not exist
 *     lantern → https://lantern.tessera.<apex>    ← does not exist
 *
 * Sign-in, billing and telemetry would every one of them address a hostname that is not there.
 * `test/hosts.test.ts` drives `cloudsforgeHosts()` from that hostname and asserts the WRONG
 * answer, so this cannot be quietly "fixed" by assumption: the day the registry gains its row,
 * that test goes red and this file gets deleted down to two passthroughs.
 *
 * `hosts()` therefore CORRECTS the registry's answer rather than passing it through. It is a
 * mechanical rewrite of a string the registry produced, confined to this file, and a no-op in
 * every other environment — localhost, an apex, a preview deployment.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application presents itself AS, for the product switcher.
 *
 * Tessera is a Forge Worlds title (23-tessera.md §1.1: "a title wears its product's colour rather
 * than claiming its own"), so `worlds` is the entry the bar marks current — a player who opens the
 * switcher from inside the world should see the platform they are playing on highlighted. The
 * registry row §10.2 asks for is `inSwitcher: false`, so marking `'tessera'` current would
 * highlight nothing at all even once it exists.
 */
export const PRODUCT: SurfaceKey = 'worlds'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'tessera-web'

/**
 * The subdomain `micro-tessera` will be served on. §10.2's registry row.
 *
 * Deleted the day `ui/packages/ui/src/surfaces.ts` carries a `tessera` entry.
 */
export const TESSERA_SUBDOMAIN = 'tessera'

/**
 * The port `micro-tessera` binds: 4022.
 *
 * Read from the service, not chosen here — `tessera/src/env.ts` declares
 * `export const DEFAULT_PORT = 4022` and argues it at length. §10.1 separates three port spaces
 * this estate keeps confusing, and 4022 sits deliberately BELOW the derived `4100 + index`
 * compose block so that no number of repositories appended to `deployableRepos()` can grow into
 * it. Three services already lost that argument: emberkin binds 4100 which is identity's compose
 * host port, aetherholm binds 4120 which is admin-api's, nda binds 4110 which is notify's.
 */
export const TESSERA_DEV_PORT = 4022

/**
 * Swap a registry-resolved URL onto a surface the registry does not carry.
 *
 * `anchor` is any URL `cloudsforgeHosts()` produced. On localhost only the port differs, so the
 * port is replaced; on a real hostname only the leading label differs, so the label is replaced.
 * Every other decision — scheme, apex derivation, whether this is a preview deployment — was made
 * by the registry and is left exactly as it made it.
 */
function deriveSurfaceUrl(anchor: string, subdomain: string, devPort: number): string {
  const url = new URL(anchor)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = String(devPort)
    url.pathname = '/'
    return url.origin
  }
  const parts = url.hostname.split('.')
  url.hostname = parts.length > 2 ? [subdomain, ...parts.slice(1)].join('.') : `${subdomain}.${url.hostname}`
  url.pathname = '/'
  return url.origin
}

/** Strip a leading `tessera.` label from a URL the registry built on our own hostname. */
function stripOwnLabel(value: string): string {
  const url = new URL(value)
  const parts = url.hostname.split('.')
  // Only when it is the SECOND label — `nimbus.tessera.<apex>`. A hostname that merely starts with
  // `tessera.` is this app's own address and the registry never produces it for another surface.
  if (parts[1] === TESSERA_SUBDOMAIN && parts.length > 3) {
    url.hostname = [parts[0], ...parts.slice(2)].join('.')
  }
  return url.toString().replace(/\/$/, '') + (url.pathname === '/' ? '' : '')
}

/**
 * Every CloudsForge base URL the registry knows, for the current environment — corrected.
 *
 * The correction fires only when the page is served from `tessera.<apex>`, which is the one case
 * the registry cannot resolve because it has no entry for this surface.
 */
export function hosts(): CloudsForgeHosts {
  const raw = cloudsforgeHosts()
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  if (!host.startsWith(`${TESSERA_SUBDOMAIN}.`)) return raw
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, stripOwnLabel(value)]),
  ) as CloudsForgeHosts
}

/**
 * The base URL of `micro-tessera`, resolved now.
 *
 * Call it per request; never cache it in a module constant — the registry resolves from
 * `window.location.hostname`, which a test may change between calls.
 *
 * `worlds-api` is the anchor because it is the surface closest in kind: a Forge Worlds service on
 * its own hostname. Any registry entry would do — the derivation only reads the shape of the URL —
 * and naming one that is conceptually adjacent means a reader checking this against the registry
 * lands somewhere that makes sense.
 *
 * This never collapses to the empty string. The template's `apiBase()` does, because an SPA and
 * its API usually share an origin behind the gateway; Tessera's client and service are separate
 * surfaces even in production, so the request is always absolute and always cross-origin.
 */
export function apiBase(): string {
  return deriveSurfaceUrl(hosts()['worlds-api'], TESSERA_SUBDOMAIN, TESSERA_DEV_PORT)
}

/**
 * Where sprite bytes come from.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A STABLE PATH, AND NEVER A PROVIDER.
 *
 * `micro-tessera-assets` resolves by identity via `materialise.py`, which writes bytes under
 * paths identical in every provider's manifest. So this client asks for `objects/seating-stool`
 * and gets whatever provider the deploy materialised — and there is no code path anywhere in this
 * bundle that can name `candidates/qwen-image-2512/`. Encoding a provider here would pin an
 * experiment into every placement the world stores.
 *
 * There is no fallback either, deliberately: an incomplete set fails loudly and writes nothing,
 * by design, and a client that substituted a placeholder sprite for a missing one would convert
 * that loud failure into a world that quietly renders wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Served from this app's OWN origin, under `/world-assets/`. That is a deploy decision
 * (`micro-deploy` maps the path at the gateway) rather than a hostname this bundle knows, which
 * keeps sprite requests same-origin: no CORS preflight on the several hundred image requests a
 * ward costs, and no second certificate in the path of the thing the player is looking at.
 */
export function assetBase(): string {
  return `${pageOrigin()}/world-assets`
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}
