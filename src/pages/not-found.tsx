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
      <p className="tw-state__title">Nothing stands at this address</p>
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
