/**
 * One read, four states, and a retry — written once rather than in every page.
 *
 * The four states are the ones `components/states.tsx` renders, and keeping them distinct is the
 * whole reason this is a hook and not `useState(null)` in six places: a spinner that never
 * resolves, an empty list that was actually a timeout, and a "no results" that was actually a
 * refusal are three different bugs that look identical once the states are collapsed.
 *
 * `undefined` means "not answered yet" and `null` is a legitimate answer, so the loaded value is
 * held in a one-element tuple. A hook that used `undefined` for both could not tell a page that
 * has not loaded from a page that loaded nothing.
 */
import { useCallback, useEffect, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'

export interface AsyncState<T> {
  /** `undefined` until the first answer. */
  readonly data: T | undefined
  readonly notice: ErrorNotice | null
  readonly reload: () => void
}

export function useAsync<T>(
  read: () => Promise<T>,
  deps: readonly unknown[],
  fallbackMessage: string,
): AsyncState<T> {
  const [holder, setHolder] = useState<[T] | undefined>(undefined)
  const [notice, setNotice] = useState<ErrorNotice | null>(null)

  // `read` is recreated on every render by every caller, so it is deliberately NOT a dependency:
  // including it would re-fire the request on every render and, on a page whose response changes
  // state, would loop. The caller's `deps` are what decide when to re-read, which puts that
  // decision where the caller can see it.
  const load = useCallback(() => {
    setNotice(null)
    setHolder(undefined)
    let live = true
    read().then(
      (value) => {
        if (live) setHolder([value])
      },
      (err: unknown) => {
        if (live) setNotice(noticeFor(err, fallbackMessage))
      },
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => load(), [load])

  return { data: holder?.[0], notice, reload: load }
}
