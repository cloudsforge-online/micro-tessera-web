/**
 * The four states a screen can be in, as four visibly different things.
 *
 * They are separated because collapsing any two of them destroys information the user needs:
 *
 *   LOADING   — we do not know yet. Waiting is the correct action.
 *   EMPTY     — the query answered, with nothing. Nothing is wrong; there is something to DO.
 *   FAILED    — the query did not answer. Retrying may work. The request id is what support needs.
 *   FORBIDDEN — the query was understood and refused. Retrying will never work. On this app that
 *               is usually not a missing role at all: `PATCH /v1/parcels/:id` and
 *               `POST /v1/parcels/:id/placements` both raise `ForbiddenError('this parcel is not
 *               yours')` BY DESIGN. A parcel's EXISTENCE is public — that is what a world is —
 *               and only changing it is refused. The copy says so.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "no results"
 * that was actually a refusal are the three failures this file exists to prevent.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second one accepts the `value ?? undefined` a caller writes
// when it may or may not have something to pass.
export function Loading({ label = 'Loading' }: { label?: string | undefined }) {
  return (
    <div className="tw-state tw-state--loading" role="status" aria-live="polite">
      <span className="tw-spinner" aria-hidden="true" />
      <p className="tw-state__title">{label}</p>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  /** Say what was asked and found nothing. "No data" describes the screen, not the answer. */
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="tw-state tw-state--empty" role="status">
      <span className="tw-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="tw-state__title">{title}</p>
      {hint && <p className="tw-state__hint">{hint}</p>}
      {action && <div className="tw-state__action">{action}</div>}
    </div>
  )
}

/**
 * A failure, with the request id on screen.
 *
 * The id is what the user quotes and what finds their exact request across every service at
 * once. It is rendered in the monospace token and made selectable on its own line, because it is
 * going to be read aloud or pasted into a support form, and an id embedded mid-sentence is
 * neither.
 */
export function Failed({
  notice,
  onRetry,
  title = 'That did not load',
}: {
  notice: ErrorNotice
  onRetry?: (() => void) | undefined
  title?: string | undefined
}) {
  return (
    <div className="tw-state tw-state--failed" role="alert">
      <span className="tw-state__icon" aria-hidden="true">
        ■
      </span>
      <p className="tw-state__title">{title}</p>
      <p className="tw-state__hint">{notice.message}</p>
      {notice.requestId && (
        <p className="tw-state__meta">
          Quote this to support: <code className="cf-num tw-reqid">{notice.requestId}</code>
        </p>
      )}
      {onRetry && (
        <div className="tw-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Refused, not broken.
 *
 * No retry button: the request was understood and denied, and a button that cannot succeed
 * teaches the user the app is unreliable. On this app a 403 usually means "not yours": another
 * player's city, someone else's fleet, a live battle you were not in.
 */
export function Forbidden({
  notice,
  title = 'That is not yours to see',
}: {
  notice?: ErrorNotice | undefined
  title?: string | undefined
}) {
  return (
    <div className="tw-state tw-state--forbidden" role="alert">
      <span className="tw-state__icon" aria-hidden="true">
        ⊘
      </span>
      <p className="tw-state__title">{title}</p>
      <p className="tw-state__hint">
        {notice?.message ??
          'Another player’s economy and fleets stay theirs until a battle report says otherwise.'}
      </p>
      {notice?.requestId && (
        <p className="tw-state__meta">
          Reference: <code className="cf-num tw-reqid">{notice.requestId}</code>
        </p>
      )}
    </div>
  )
}
