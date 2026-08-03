/**
 * Finding a real browser, and refusing to be green without one.
 *
 * ── Why a missing browser is a FAILURE and not a skip ─────────────────────────────────────────
 *
 * This estate keeps producing checks that cannot fail. Tonight alone: six tests that `return`ed
 * instead of skipping and therefore passed; a CI rule that inverted and reported a live invariant
 * missing; four tests grading the wrong function because their citations had drifted; and a
 * self-referential assertion where a page was compared against the same constant it rendered from.
 * A measurement that quietly skips itself when it cannot find a browser is that defect in its
 * purest form — it would be green everywhere and would have measured nothing.
 *
 * So `chromePath()` throws, and names every path it looked in. Set `CF_CHROME` if the browser is
 * somewhere unusual. There is deliberately no `CF_SKIP` of any kind.
 *
 * The candidate list and its reasoning are carried from `aetherholm-web/test/journeys/browser.ts`,
 * which reached the same conclusion for the same reason: `playwright-core` drives a Chromium that
 * is already on the machine, rather than downloading ~1.5 GB of browsers on install.
 */
import { access, constants, readdir } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

function candidatePaths(): string[] {
  const paths: string[] = []
  const fromEnv = process.env['CF_CHROME'] ?? process.env['CHROME_PATH'] ?? ''
  if (fromEnv) paths.push(fromEnv)
  paths.push(
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  )
  if (platform() === 'darwin') {
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )
  }
  return paths
}

function playwrightCaches(): string[] {
  const home = homedir()
  return platform() === 'darwin'
    ? [join(home, 'Library', 'Caches', 'ms-playwright')]
    : [join(home, '.cache', 'ms-playwright')]
}

async function playwrightChromiums(): Promise<string[]> {
  const found: string[] = []
  for (const root of playwrightCaches()) {
    let entries: string[]
    try {
      entries = await readdir(root)
    } catch {
      continue
    }
    for (const entry of entries.sort().reverse()) {
      if (!entry.startsWith('chromium')) continue
      found.push(
        platform() === 'darwin'
          ? join(root, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
          : join(root, entry, 'chrome-linux', 'chrome'),
        join(root, entry, 'chrome-mac', 'headless_shell'),
        join(root, entry, 'chrome-linux', 'headless_shell'),
      )
    }
  }
  return found
}

export async function chromePath(): Promise<string> {
  const candidates = [...candidatePaths(), ...(await playwrightChromiums())]
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK)
      return path
    } catch {
      // next
    }
  }
  throw new Error(
    'No Chromium found, and this measurement will not pretend to have run without one.\n' +
      'Set CF_CHROME to an executable, or install Google Chrome.\n' +
      `Looked in:\n  ${candidates.join('\n  ')}`,
  )
}
