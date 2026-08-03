/**
 * Host resolution, including the registry defect this client corrects.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TEST THAT USED TO BE HERE ASSERTED THAT THE REGISTRY WAS WRONG, AND IT FIRED.
 *
 * `@cloudsforge/ui`'s surface registry had no `tessera` key when this client was written, so
 * `cloudsforgeHosts()` could not recognise `tessera.<apex>` as a known subdomain and left it in
 * place — resolving `nimbus.tessera.<apex>`, `pay.tessera.<apex>` and `lantern.tessera.<apex>`:
 * three hostnames that do not exist, one of which is sign-in. `src/lib/hosts.ts` corrected it, and
 * this file asserted the UNCORRECTED answer, deliberately, so that:
 *
 *   - the correction was demonstrably a correction rather than a guess, and
 *   - this repository went red the moment `micro-ui` gained its row — which is exactly when the
 *     correction had to be deleted.
 *
 * It went red, mid-build, while a sibling agent was adding the row. The workaround was deleted in
 * the same change. What replaces it is the check the registry's own comment asks for: **the
 * registry and the service must agree about the port**, asserted against `TESSERA_DEV_PORT`, which
 * is read from `tessera/src/env.ts` rather than from the registry — so the two sides of the
 * comparison come from different places, which is the whole difference between this and the
 * assertion that compared a URL with a copy of itself.
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
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE TWO SIDES COME FROM DIFFERENT PLACES, WHICH IS THE POINT.
  //
  // `base` is the REGISTRY's answer, resolved through `cloudsforgeHosts()`. `TESSERA_DEV_PORT` is
  // the SERVICE's number, transcribed from `tessera/src/env.ts` where `DEFAULT_PORT = 4022` is
  // declared and argued. If either moves without the other, this fails.
  //
  // Comparing the registry against itself is the defect this estate found tonight in the SSO
  // callback pin: the client posted to `/auth/exchange`, a route identity has never served, and
  // the test compared the URL with a copy of itself so it could never have failed.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(
    base,
    `http://localhost:${TESSERA_DEV_PORT}`,
    'the registry and micro-tessera disagree about which port the service binds',
  )
  assert.equal(TESSERA_DEV_PORT, 4022, 'the service no longer binds 4022')
})

test('on the apex the service resolves to its own subdomain', () => {
  const base = at('https://tessera.cloudsforge.online/', apiBase)
  assert.equal(base, 'https://tessera.cloudsforge.online')
})

test('served from tessera.<apex>, sign-in addresses a hostname that exists', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE DEFECT THIS FILE WAS BUILT AROUND, NOW ASSERTED AS FIXED RATHER THAN AS PRESENT.
  //
  // `tessera` is in KNOWN_SUBS, so the apex is derived by stripping it and every other surface
  // resolves on the apex. Before the registry row these three were `nimbus.tessera.<apex>` and
  // friends — hostnames that do not exist, one of which is where every Sign in button leads.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const resolved = at('https://tessera.cloudsforge.online/', hosts)
  assert.equal(resolved.nimbus, 'https://nimbus.cloudsforge.online')
  assert.equal(resolved.pay, 'https://pay.cloudsforge.online')
  assert.equal(resolved.lantern, 'https://lantern.cloudsforge.online')

  // And `hosts()` is now a passthrough, which is what "the workaround is gone" means mechanically.
  assert.deepEqual(resolved, at('https://tessera.cloudsforge.online/', cloudsforgeHosts))
})

test('every other environment resolves as the registry says, untouched', () => {
  for (const url of [
    'http://localhost:5172/',
    // A preview deployment on an unknown apex, which the registry deliberately leaves alone.
    'https://pr-42.example.dev/',
    // Another surface's hostname — nothing here may fire on somebody else's page.
    'https://market.cloudsforge.online/',
  ]) {
    assert.deepEqual(at(url, hosts), at(url, cloudsforgeHosts), `hosts() rewrote something at ${url}`)
  }
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
