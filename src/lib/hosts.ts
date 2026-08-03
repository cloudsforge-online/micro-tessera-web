/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so the same bundle
 * addresses `http://localhost:4022` when served from localhost and `https://tessera.<apex>` when
 * served from the apex. Nothing here reads a build-time constant; see the note in vite.config.ts.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE USED TO CARRY A WORKAROUND, AND A TEST DELETED IT.
 *
 * `@cloudsforge/ui`'s surface registry had no `tessera` key when this client was written.
 * `SurfaceKey` enumerates every addressable surface, `KNOWN_SUBS` is built from their subdomains,
 * and `cloudsforgeHosts()` derives the apex by stripping a known subdomain from the browser's
 * hostname. An unknown prefix is left alone — correct for a preview deployment at
 * `pr-42.example.dev`, and WRONG for this app in production. Served from `https://tessera.<apex>`
 * the registry resolved `nimbus.tessera.<apex>`, `pay.tessera.<apex>` and
 * `lantern.tessera.<apex>`: three hostnames that do not exist, one of which is sign-in.
 *
 * So `hosts()` corrected the registry's answer — a `deriveSurfaceUrl` for the API base and a
 * `stripOwnLabel` over every other surface — and `test/hosts.test.ts` asserted the WRONG answer
 * from `cloudsforgeHosts()`, deliberately, so that the correction was a correction rather than a
 * guess AND so that this repository would go red the day the registry gained its row.
 *
 * It went red. `micro-ui` now carries the surface (`ui/packages/ui/src/surfaces.ts`, `key:
 * 'tessera'`, `subdomain: 'tessera'`, `devPort: 4022`), `KNOWN_SUBS` contains it, and the
 * workaround is gone — `deriveSurfaceUrl`, `stripOwnLabel` and the corrected `hosts()`, in full,
 * in the same change that noticed.
 *
 * That is the whole value of writing the promise as a failing condition rather than as a comment.
 * `micro-emberkin-web` made the same promise in prose: its rewire happened in two halves months
 * apart, and only half-happened anyway — `hosts()` was repointed while all four dead exports
 * survived, still imported by a settings screen.
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

/** The subdomain `micro-tessera` is served on, as the registry now carries it. */
export const TESSERA_SUBDOMAIN = 'tessera'

/**
 * The port `micro-tessera` binds: 4022.
 *
 * Kept as a named constant even though `apiBase()` no longer uses it, because `test/hosts.test.ts`
 * asserts the registry's `devPort` equals it — a check that would be worth nothing if both sides
 * read the registry. The number is the service's own: `tessera/src/env.ts` declares
 * `export const DEFAULT_PORT = 4022` and argues it at length. §10.1 separates three port spaces
 * this estate keeps confusing, and 4022 sits deliberately BELOW the derived `4100 + index` compose
 * block so that no number of repositories appended to `deployableRepos()` can grow into it. Three
 * services already lost that argument: emberkin binds 4100 which is identity's compose host port,
 * aetherholm binds 4120 which is admin-api's, nda binds 4110 which is notify's.
 */
export const TESSERA_DEV_PORT = 4022

/**
 * Every CloudsForge base URL the registry knows, for the current environment.
 *
 * Passed through, untouched. This used to strip `tessera.` from every resolved URL; see the
 * header for why, and for what deleted it.
 */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/**
 * The base URL of `micro-tessera`, resolved now.
 *
 * Call it per request; never cache it in a module constant — the registry resolves from
 * `window.location.hostname`, which a test may change between calls.
 *
 * Straight from the registry now that `tessera` is a surface in it. This used to derive the URL
 * from `worlds-api` by swapping labels and forcing a port, because there was nothing to read.
 *
 * It never collapses to the empty string. The template's `apiBase()` does, because an SPA and its
 * API usually share an origin behind the gateway; Tessera's client and service are separate
 * surfaces even in production, so the request is always absolute and always cross-origin.
 */
export function apiBase(): string {
  return new URL(hosts().tessera).origin
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
 * THIS IS A BASE, AND NOT HALF OF A FILENAME. What follows it is read from the mount's own
 * `SET.json`, never spelled here: an identity is `objects/seating-stool` and the file it resolves
 * to is `objects/seating-stool-512x512.png`. A client that appended `.png` to the identity — which
 * this one did — asks for a name nothing serves, and every check upstream of it still passes.
 * `src/lib/asset-set.ts` carries the account.
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
