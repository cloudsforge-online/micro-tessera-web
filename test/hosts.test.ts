/**
 * Host resolution, including the registry defect this client corrects.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE INTERESTING TEST IN THIS FILE ASSERTS THAT THE REGISTRY IS WRONG.
 *
 * `@cloudsforge/ui`'s surface registry has no `tessera` key, so `cloudsforgeHosts()` cannot
 * recognise `tessera.<apex>` as a known subdomain and leaves it in place — which is correct for a
 * preview deployment and wrong for this app in production. Served from `https://tessera.<apex>`
 * it resolves `nimbus.tessera.<apex>`, `pay.tessera.<apex>` and `lantern.tessera.<apex>`: three
 * hostnames that do not exist, one of which is sign-in.
 *
 * Asserting the WRONG answer, from the registry, is what makes the correction in `src/lib/hosts.ts`
 * a correction rather than a guess — and it is what turns this repository red on the day
 * `micro-ui` gains its `tessera` row, which is exactly when that correction must be deleted. A
 * test that only asserted the corrected answer would go on passing after the workaround became a
 * bug, which is how `micro-emberkin-web` carried four dead exports through a rewire that happened
 * in two halves months apart.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { cloudsforgeHosts } from '@cloudsforge/ui'
import {
  TESSERA_DEV_PORT,
  TESSERA_SUBDOMAIN,
  apiBase,
  assetBase,
  hosts,
  pageOrigin,
} from '../src/lib/hosts.ts'

/** Run `body` with `window.location` at `url`. */
function at<T>(url: string, body: () => T): T {
  const win = new Window({ url })
  const g = globalThis as unknown as Record<string, unknown>
  const saved = Object.getOwnPropertyDescriptor(g, 'window')
  Object.defineProperty(g, 'window', { configurable: true, writable: true, value: win })
  try {
    return body()
  } finally {
    if (saved) Object.defineProperty(g, 'window', saved)
    else delete g['window']
    win.close()
  }
}

test('on localhost the service resolves to the port it binds', () => {
  const base = at('http://localhost:5172/', apiBase)
  assert.equal(
    base,
    `http://localhost:${TESSERA_DEV_PORT}`,
    'the client does not address the port micro-tessera binds',
  )
  // 4022, and the number is the service's own. `tessera/src/env.ts` declares
  // `export const DEFAULT_PORT = 4022`.
  assert.equal(TESSERA_DEV_PORT, 4022)
})

test('on the apex the service resolves to its own subdomain', () => {
  const base = at('https://tessera.cloudsforge.online/', apiBase)
  assert.equal(base, 'https://tessera.cloudsforge.online')
})

test('THE REGISTRY IS WRONG FROM tessera.<apex>, and this records it', () => {
  const raw = at('https://tessera.cloudsforge.online/', cloudsforgeHosts)

  // The uncorrected registry answer. When `micro-ui` gains a `tessera` row these three become
  // `https://nimbus.cloudsforge.online` and this test goes red — which is the signal to delete
  // `stripOwnLabel` from src/lib/hosts.ts, not to update this expectation.
  assert.equal(
    raw.nimbus,
    'https://nimbus.tessera.cloudsforge.online',
    'micro-ui now carries a `tessera` surface — delete the correction in src/lib/hosts.ts',
  )
  assert.equal(raw.pay, 'https://pay.tessera.cloudsforge.online')
  assert.equal(raw.lantern, 'https://lantern.tessera.cloudsforge.online')
})

test('this client corrects it, so sign-in addresses a hostname that exists', () => {
  const corrected = at('https://tessera.cloudsforge.online/', hosts)
  assert.equal(corrected.nimbus, 'https://nimbus.cloudsforge.online')
  assert.equal(corrected.pay, 'https://pay.cloudsforge.online')
  assert.equal(corrected.lantern, 'https://lantern.cloudsforge.online')
})

test('the correction is a no-op everywhere else', () => {
  // Localhost.
  const local = at('http://localhost:5172/', hosts)
  assert.equal(local.nimbus, at('http://localhost:5172/', cloudsforgeHosts).nimbus)

  // A preview deployment on an unknown apex, which the registry deliberately leaves alone.
  const preview = at('https://pr-42.example.dev/', hosts)
  assert.equal(preview.nimbus, at('https://pr-42.example.dev/', cloudsforgeHosts).nimbus)

  // Another surface's hostname — the correction must not fire on somebody else's page.
  const market = at('https://market.cloudsforge.online/', hosts)
  assert.equal(market.nimbus, 'https://nimbus.cloudsforge.online')
})

test('sprites are same-origin, under a path with no provider in it', () => {
  const base = at('https://tessera.cloudsforge.online/', assetBase)
  assert.equal(base, 'https://tessera.cloudsforge.online/world-assets')
  assert.doesNotMatch(base, /candidates/, 'the asset base names a provider')
  // Same origin as the page, so several hundred sprite requests take no CORS preflight.
  assert.ok(
    base.startsWith(at('https://tessera.cloudsforge.online/', pageOrigin)),
    'sprites are not same-origin with the page',
  )
})

test('the subdomain this client claims is the one §10.2 asks micro-ui to register', () => {
  assert.equal(TESSERA_SUBDOMAIN, 'tessera')
})
