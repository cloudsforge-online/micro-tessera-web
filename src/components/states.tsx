/**
 * The five states a screen can be in, as five visibly different things.
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
 *   SIGNED OUT— the query was refused for want of a token, and the remedy is a button. See below.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "no results"
 * that was actually a refusal are the three failures this file exists to prevent. The fifth state
 * was added because a fourth one was happening: a REFUSAL FOR WANT OF A TOKEN was being rendered
 * as a failure, so the first thing a signed-out stranger saw on the public World page was "That
 * did not load" over a Try again button that could never work.
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
  title = 'That would not load',
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
          Give support this reference: <code className="cf-num tw-reqid">{notice.requestId}</code>
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
/**
 * Refused for want of a token — an invitation, not an error.
 *
 * ── Why this is a state and not a `<Failed>` with kinder words ────────────────────────────────
 *
 * `micro-tessera` authenticates every route including the reads (`tessera/src/server.ts`),
 * and `src/lib/routes.ts` already records the consequence and calls it the service's gap to
 * close: "what a signed-out visitor actually gets is the screen and an invitation — not the
 * world." The invitation is this component. Until this existed the intent was written down in
 * one file and contradicted by the rendering in three others.
 *
 * `role="status"`, deliberately NOT `role="alert"`. Nothing has gone wrong. A screen reader
 * announcing an alert to a visitor who simply has not signed in yet is telling them about a
 * malfunction that is not happening.
 *
 * NO REQUEST ID. The id is the thing support needs in order to find a failure across the estate,
 * and printing one here would tell the reader that something went wrong and was recorded. Nothing
 * did. The message from the service ("a valid bearer token is required") is not shown either: it
 * is a protocol sentence written for a client, not for a person standing at a door.
 */
export function SignedOut({
  onSignIn,
  title = 'Sign in and the world opens',
  hint = 'Tessera wants to know who is walking in before it shows you around. Nothing is wrong — the wards are open, and the same account works across every Forge Worlds title.',
}: {
  onSignIn?: (() => void) | undefined
  title?: string | undefined
  hint?: string | undefined
}) {
  return (
    <div className="tw-state tw-state--signedout" role="status">
      <span className="tw-state__icon" aria-hidden="true">
        ◆
      </span>
      <p className="tw-state__title">{title}</p>
      <p className="tw-state__hint">{hint}</p>
      {onSignIn && (
        <div className="tw-state__action">
          <button type="button" className="cf-btn" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      )}
    </div>
  )
}

export function Forbidden({
  notice,
  title = 'Somebody else owns this',
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
