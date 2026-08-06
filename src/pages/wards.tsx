/**
 * Every ward: what kind of place it is, how full it is, and which instance holds whom.
 *
 * The instance column is not a statistic. §4: "A ward instance carries 60 avatars; the 61st
 * arrival opens instance 2, and the ward's own page says which instance holds whom, because a
 * friend you cannot find is worse than a crowd you cannot join." So the presence read is per-ward
 * and the instance is shown per person, which is the only form in which that sentence is true.
 *
 * Occupancy is shown because §4 makes it mechanical: at 70% the next ward mints automatically, so
 * "this ward is 68% claimed" tells a reader something that is about to happen rather than a
 * statistic about the past.
 */
import { useState } from 'react'
import { listWards, wardPresence, type Ward } from '../lib/tessera.ts'
import { useAsync } from '../lib/useAsync.ts'
// `signIn` from the api module, NOT `useSession().signIn` — they are the same function, and this
// form does not require the page to be inside `<AuthProvider>`. The redirect needs no session
// state to compute: it sends the browser to the Account portal with the current URL as the return
// address. Taking it off the context keeps these pages renderable on their own, which is how
// `test/screens.test.ts` mounts every one of them.
import { signIn } from '../lib/api.ts'
import { Empty, Failed, Loading, SignedOut } from '../components/states.tsx'

export function WardsPage() {
  const { data, notice, reload } = useAsync(listWards, [], 'The wards could not be read.')
  const [open, setOpen] = useState<string | null>(null)

  // The signed-out branch comes FIRST, because a 401 is also a `notice` and the generic failure
  // below would otherwise claim the Mosaic did not load. It loaded; we were not asked politely.
  if (notice?.unauthenticated) return <SignedOut onSignIn={() => signIn()} />
  if (notice) return <Failed notice={notice} onRetry={reload} />
  if (data === undefined) return <Loading label="Reading the Mosaic" />

  const wards = data.wards
  return (
    <div className="tw-wards">
      <header className="tw-page-head">
        <h1>The Mosaic</h1>
        <p className="tw-page-head__meta">
          The world is made of wards, and it grows to fit whoever turns up: once a ward is 70%
          taken, the next one opens. So you will never be shut out of somewhere to build. Being
          next door to the places people actually visit is the scarce part, and no amount of money
          buys it.
        </p>
      </header>

      {wards.length === 0 && (
        <Empty
          title="No ward has opened"
          hint="The Commons comes first, and eleven wards with characters of their own follow it. Until one is open there is nowhere to put a deed."
        />
      )}

      {wards.length > 0 && (
        <div className="tw-scroll">
          <table className="tw-table">
            <caption className="tw-visually-hidden">
              Every ward, its archetype, occupancy and instance count
            </caption>
            <thead>
              <tr>
                <th scope="col">Ward</th>
                <th scope="col">Kind</th>
                <th scope="col">Claimed</th>
                <th scope="col">Instances</th>
                <th scope="col">Who is here</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((ward) => (
                <WardRow
                  key={ward.id}
                  ward={ward}
                  open={open === ward.id}
                  onToggle={() => setOpen(open === ward.id ? null : ward.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WardRow({
  ward,
  open,
  onToggle,
}: {
  ward: Ward
  open: boolean
  onToggle: () => void
}) {
  // Rounded for display only. `occupancy` arrives from the service already computed against
  // `claimableTiles`, so the client is not deriving the 70% trigger — it is printing a number
  // somebody else decided.
  const percent = Math.round(ward.occupancy * 100)
  return (
    <>
      <tr>
        <th scope="row">{ward.name}</th>
        <td>{ward.archetype}</td>
        <td>
          {percent}% <span className="tw-muted">of {ward.claimableTiles.toLocaleString()} tiles</span>
        </td>
        <td>{ward.instances}</td>
        <td>
          <button type="button" className="tw-button tw-button--quiet" onClick={onToggle}>
            {open ? `Hide who is in ${ward.name}` : `Who is in ${ward.name}`}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <Presence wardId={ward.id} wardName={ward.name} />
          </td>
        </tr>
      )}
    </>
  )
}

function Presence({ wardId, wardName }: { wardId: string; wardName: string }) {
  const { data, notice, reload } = useAsync(
    () => wardPresence(wardId),
    [wardId],
    `Who is in ${wardName} could not be read.`,
  )

  if (notice) return <Failed notice={notice} onRetry={reload} />
  if (data === undefined) return <Loading label={`Looking in ${wardName}`} />
  if (data.avatars.length === 0) {
    return <Empty title={`Nobody is in ${wardName} right now`} />
  }

  // Grouped by instance, because that is the question this list exists to answer.
  const byInstance = new Map<number, string[]>()
  for (const avatar of data.avatars) {
    const bucket = byInstance.get(avatar.instance)
    if (bucket) bucket.push(avatar.subject)
    else byInstance.set(avatar.instance, [avatar.subject])
  }

  return (
    <dl className="tw-instances">
      {[...byInstance.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([instance, subjects]) => (
          <div key={instance} className="tw-instances__row">
            <dt>Instance {instance}</dt>
            <dd>
              {subjects.length} here — {subjects.join(', ')}
            </dd>
          </div>
        ))}
    </dl>
  )
}
