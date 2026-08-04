/**
 * The app shell: the company bar, the navigation strip, the wallet strip, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented — it is what makes
 * moving between surfaces feel like one application. Everything this app adds goes BELOW it. The
 * bar marks `worlds` current, because a title is played through Forge Worlds and wears its
 * accent rather than claiming one (§1.1) — see PRODUCT in src/lib/hosts.ts.
 *
 * ── The readiness banner this shell does NOT have ─────────────────────────────────────────────
 *
 * `aetherholm-web`'s shell reads `GET /readyz` once per mount and shows a degradation banner.
 * `micro-tessera` serves `/readyz` too — but it serves it behind the same bearer-token check as
 * everything else is behind, and a signed-out visitor on `/discover` would fire an unauthenticated
 * probe that 401s on every mount. A banner that reports "degraded" whenever nobody is signed in is
 * worse than no banner, so the honest version is to leave it out until the service has an
 * unauthenticated readiness surface, and to say why here rather than ship a probe that is wrong
 * half the time.
 */
import { CloudsForgeBar, CloudsForgeFooter } from '@cloudsforge/ui'
import { NavLink, Outlet } from 'react-router-dom'
import { FOOTER_SURFACE, PRODUCT } from '../lib/hosts.ts'
import { useSession } from '../lib/auth.tsx'
import { NAV } from '../lib/routes.ts'
import { WalletStrip } from './wallet-strip.tsx'

export function AppShell() {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        The skip link is the first focusable thing in the document, and it is visually hidden until
        it TAKES FOCUS, at which point it must become visible. A skip link that stays hidden when
        focused is worse than none: a keyboard reader activates it and cannot tell whether anything
        happened.
      */}
      <a className="tw-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar current={PRODUCT} account={account} onSignIn={() => signIn()} onSignOut={signOut} />

      <nav className="tw-nav" aria-label="World sections">
        <div className="tw-nav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `tw-nav__link${isActive ? ' is-active' : ''}`}
            >
              {item.nav}
            </NavLink>
          ))}
        </div>
      </nav>

      {/*
        `account.signedIn`, NOT `account`.

        `account` is always an object — `{ signedIn: false, handle: null, roles: null }` when
        nobody is signed in — so `{account && …}` is always true and the strip rendered for every
        anonymous visitor. Found by driving the built bundle in a real browser and reading the
        body text: "Sign in … Available Not available yet". A stranger who has never had an
        account was being shown a panel about their EMBER.

        Neither the unit tests nor the type checker could have caught it: the strip renders
        correctly in isolation, and a truthy object is a perfectly good object.
      */}
      {account.signedIn && <WalletStrip />}

      <main className="tw-main" id="main">
        <Outlet />
      </main>

      {/*
        The company footer, from @cloudsforge/ui. Every link in it is derived from the surface
        registry, so a new product appears here without this file changing — which is the reason
        the estate is not growing a fifth hand-rolled footer beside the four it already had.

        `current` is FOOTER_SURFACE, not the bar's surface: see lib/hosts.ts for why those are two
        different questions. `account` decides only whether the operator surfaces are offered.
      */}
      <CloudsForgeFooter current={FOOTER_SURFACE} account={account} />
    </>
  )
}
