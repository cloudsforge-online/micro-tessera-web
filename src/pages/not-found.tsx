/**
 * The 404 page. nginx has already answered 404 for this address (see nginx.conf) — this renders
 * INSIDE that response, so the status line and the screen agree. It offers the route table as
 * somewhere to go, which is why every route in src/lib/routes.ts carries a blurb.
 */
import { Link } from 'react-router-dom'
import { ROUTES } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <div className="tw-state tw-state--empty" role="status">
      <span className="tw-state__icon" aria-hidden="true">
        ◇
      </span>
      {/*
        An h1, not a p. This was the one page in the bundle with no heading of any level, so a
        screen reader's heading list came back empty and there was nothing to jump to. The class
        sets the size and clears the margin, so it looks exactly as it did.
      */}
      <h1 className="tw-state__title">Nothing stands at this address</h1>
      <p className="tw-state__hint">Try one of these instead:</p>
      <ul className="tw-notfound">
        {ROUTES.map((route) => (
          <li key={route.path}>
            <Link className="tw-link" to={route.path}>
              {route.nav ?? route.path}
            </Link>{' '}
            — {route.blurb}
          </li>
        ))}
      </ul>
    </div>
  )
}
