/**
 * The Kiln: describe a thing into existence.
 *
 * ── 202, and what that means for this screen ──────────────────────────────────────────────────
 *
 * `POST /v1/kiln/firings` answers **202 with `{ object, statusUrl }`**, not a finished object.
 * Generation is a leased job on both sides — `micro-tessera` enqueues, `micro-studio`'s
 * `runGeneration` executes inside a lease claimed `for update skip locked`, and the lease key is
 * `owner:<subject>` so one player's firings serialise and cannot stampede the provider.
 *
 * So this page polls `statusUrl` (which is `/v1/objects/<id>`) and says which of the three states
 * the object is in. It does NOT show a progress bar: there is no progress to report — a leased job
 * is claimed or it is not — and a bar that fills at a rate nobody measured is a lie told smoothly.
 *
 * ── 503 is a supported mode, not an outage ────────────────────────────────────────────────────
 *
 * Where the Kiln has no upstream configured the route answers `503 kiln_unconfigured`, and the
 * service's own comment says why: "a world you can walk around in with a cold Kiln is better than
 * a title that refuses to boot over one dependency". This page says that in those words rather
 * than showing a generic failure, because a generic failure invites a retry that cannot work.
 *
 * ── What is missing, and named ────────────────────────────────────────────────────────────────
 *
 * A fired object has a `checksum` and no sprite path, so nothing here can preview it. §2.6's 96
 * platform seed objects — "free to every account forever" — have no route at all. Both are in
 * `MISSING_ROUTES` and both are said on this screen rather than worked around.
 */
import { useEffect, useRef, useState } from 'react'
import {
  MISSING_ROUTES,
  fireObject,
  getObject,
  myObjects,
  type WorldObject,
} from '../lib/tessera.ts'
import { ApiError, noticeFor, type ErrorNotice } from '../lib/api.ts'
import { useAsync } from '../lib/useAsync.ts'
import { Empty, Failed, Loading } from '../components/states.tsx'

/** The twelve categories of §2.6. Not derived from anything the service serves — it serves none. */
const CATEGORIES = [
  'seating',
  'surfaces',
  'storage',
  'lighting',
  'structure',
  'flooring',
  'foliage',
  'signage',
  'machines',
  'instruments',
  'vehicles',
  'ornament',
] as const

export function KilnPage() {
  const mine = useAsync(myObjects, [], 'Your objects could not be read.')

  return (
    <div className="tw-kiln">
      <header className="tw-page-head">
        <h1>The Kiln</h1>
        <p className="tw-page-head__meta">
          Describe it, pick a footprint, wait about a minute. What comes out is addressed by the
          sha256 of its own bytes, so authorship is not a claim anybody files.
        </p>
      </header>

      <FiringForm onFired={mine.reload} />

      <section aria-labelledby="mine-heading">
        <h2 id="mine-heading">What you have fired</h2>
        {mine.notice && <Failed notice={mine.notice} onRetry={mine.reload} />}
        {!mine.notice && mine.data === undefined && <Loading label="Opening the cooling rack" />}
        {mine.data?.objects.length === 0 && (
          <Empty title="You have fired nothing yet" hint="A daily allowance of firings is free." />
        )}
        {mine.data && mine.data.objects.length > 0 && <ObjectTable objects={mine.data.objects} />}
      </section>

      <SeedObjectsGap />
    </div>
  )
}

function FiringForm({ onFired }: { onFired: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [footprint, setFootprint] = useState<'1x1' | '2x2'>('1x1')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<ErrorNotice | null>(null)
  const [cold, setCold] = useState(false)
  const [watching, setWatching] = useState<WorldObject | null>(null)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    setCold(false)
    fireObject({ prompt, category, footprint })
      .then((res) => {
        setWatching(res.object)
        onFired()
      })
      .catch((err: unknown) => {
        // The 503 is a state of the world, not a failure of this request, and it gets its own
        // sentence. Everything else is an ordinary refusal with the service's own words.
        if (err instanceof ApiError && err.code === 'kiln_unconfigured') setCold(true)
        else setNotice(noticeFor(err, 'The firing was not accepted.'))
      })
      .finally(() => setBusy(false))
  }

  return (
    <form className="tw-form" onSubmit={submit} aria-labelledby="fire-heading">
      <h2 id="fire-heading">Fire an object</h2>

      <label className="tw-field">
        <span className="tw-field__label">What is it?</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          required
          placeholder="a low bench of pale scorched timber, worn smooth in the middle"
        />
      </label>

      <div className="tw-field-row">
        <label className="tw-field">
          <span className="tw-field__label">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="tw-field">
          <legend className="tw-field__label">Footprint</legend>
          {/*
            Two, and only two, because §6.3 has two — `1x1` and `2x2`. The service rejects a third
            with a 400 that names the section. There is no third option here because there is no
            third footprint, not because this form is hiding one.
          */}
          {(['1x1', '2x2'] as const).map((f) => (
            <label key={f} className="tw-radio">
              <input
                type="radio"
                name="footprint"
                value={f}
                checked={footprint === f}
                onChange={() => setFootprint(f)}
              />
              <span>{f}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <button type="submit" className="tw-button" disabled={busy}>
        {busy ? 'Firing…' : 'Fire it'}
      </button>

      {cold && (
        <p className="tw-form__note" role="status">
          The Kiln has no upstream configured here, so nothing can be fired in this environment.
          That is a supported state rather than an outage — the rest of the world still works, and
          retrying will not change it.
        </p>
      )}
      {notice && (
        <p className="tw-form__error" role="alert">
          {notice.message}
          {notice.requestId ? ` (request ${notice.requestId})` : ''}
        </p>
      )}
      {watching && <FiringWatch objectId={watching.id} />}
    </form>
  )
}

/**
 * Poll `statusUrl` until the object stops being `firing`.
 *
 * Two seconds, and it STOPS: at `fired` or `failed` there is nothing more to ask, and after
 * `MAX_POLLS` it says so rather than continuing. A poll with no ceiling is a tab left open
 * overnight making a request every two seconds against a job that died.
 */
const MAX_POLLS = 90

function FiringWatch({ objectId }: { objectId: string }) {
  const [object, setObject] = useState<WorldObject | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const polls = useRef(0)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    polls.current = 0
    setGaveUp(false)

    const tick = (): void => {
      getObject(objectId)
        .then((res) => {
          if (!live) return
          setObject(res.object)
          polls.current += 1
          if (res.object.status === 'firing') {
            if (polls.current >= MAX_POLLS) setGaveUp(true)
            else timer = setTimeout(tick, 2000)
          }
        })
        .catch(() => {
          // A read that fails mid-firing is not the firing failing. Stop asking and say nothing
          // false about the object; the list below is refreshed on the next page load.
          if (live) setGaveUp(true)
        })
    }
    tick()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [objectId])

  if (!object) return <Loading label="Asking the Kiln" />
  return (
    <p className="tw-form__ok" role="status">
      {object.status === 'firing' && !gaveUp && 'In the Kiln. This takes about a minute.'}
      {object.status === 'firing' && gaveUp &&
        'Still firing after three minutes. It may still finish — it is on your rack below.'}
      {object.status === 'fired' &&
        `Fired. Its identity is ${object.checksum ?? 'not yet recorded'} — the sha256 of its own bytes.`}
      {object.status === 'failed' && 'The firing failed. Nothing was charged for a firing that produced nothing.'}
    </p>
  )
}

function ObjectTable({ objects }: { objects: readonly WorldObject[] }) {
  return (
    <div className="tw-scroll">
      <table className="tw-table">
        <caption className="tw-visually-hidden">Objects you have fired</caption>
        <thead>
          <tr>
            <th scope="col">What you asked for</th>
            <th scope="col">Category</th>
            <th scope="col">Footprint</th>
            <th scope="col">State</th>
            <th scope="col">Identity</th>
            <th scope="col">Anchored</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((object) => (
            <tr key={object.id}>
              <th scope="row">{object.prompt}</th>
              <td>{object.category}</td>
              <td>{object.footprint}</td>
              <td>{object.status}</td>
              <td className="tw-mono">{object.checksum ?? '—'}</td>
              <td>
                {/*
                  §9.3: anchoring is lazy and user-initiated — written when a creator first LISTS
                  an object, not when they fire it, "because most objects are never sold and paying
                  gas to anchor a chair nobody sells is waste". So "not anchored" is the normal
                  state and is worded as such rather than as something missing.
                */}
                {object.anchoredAt
                  ? `Block ${object.anchorBlock ?? '?'}`
                  : 'Not yet — anchored when first listed'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The seed set, and the fact that this client cannot reach it. */
function SeedObjectsGap() {
  const gap = MISSING_ROUTES.find((r) => r.want.includes('seed objects'))
  if (!gap) return null
  return (
    <section aria-labelledby="seed-heading" className="tw-gap">
      <h2 id="seed-heading">The 96 seed objects</h2>
      <p>
        Twelve categories of eight, free to every account forever, never sold and never removed.
        They are the counterweight that makes paying for Kiln capacity honest: nobody is ever
        unable to build.
      </p>
      <p role="status">
        They are not shown here, because micro-tessera serves no route that lists them —{' '}
        <code>GET /v1/objects</code> returns only objects you fired yourself. Nothing has been
        substituted for them.
      </p>
    </section>
  )
}
