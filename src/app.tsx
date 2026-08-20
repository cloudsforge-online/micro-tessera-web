/**
 * The route table.
 *
 * It must agree with `src/lib/routes.ts` and with the enumerated `location` block in `nginx.conf`;
 * `test/routes.test.ts` checks all three against each other. A route added here and not to nginx
 * works perfectly under `pnpm dev` and 404s on the first hard refresh in production.
 *
 * No lazy boundary. The renderer is the heaviest thing in this bundle and it is also the FIRST
 * screen — splitting it would buy a round trip on the one page where the user is waiting to see
 * something, in exchange for a smaller bundle on five pages where they are not.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, ProtectedRoute } from './lib/auth.tsx'
import { DiscoverPage } from './pages/discover.tsx'
import { KilnPage } from './pages/kiln.tsx'
import { LandPage } from './pages/land.tsx'
import { NotFoundPage } from './pages/not-found.tsx'
import { WardsPage } from './pages/wards.tsx'
import { WorkshopPage } from './pages/workshop.tsx'
import { WorldPage } from './pages/world.tsx'
import { BASE } from './lib/routes.ts'

export function App() {
  return (
    <BrowserRouter basename={BASE}>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/*
              Public, and §5's first line rather than an oversight: "arrive at the Commons — a
              browser tab; no download, no plugin, NO ACCOUNT WALL." A stranger handed a link to
              somebody's place should see the place.
            */}
            <Route index element={<WorldPage />} />
            <Route path="/wards" element={<WardsPage />} />
            <Route
              path="/land"
              element={
                <ProtectedRoute>
                  <LandPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/kiln"
              element={
                <ProtectedRoute>
                  <KilnPage />
                </ProtectedRoute>
              }
            />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route
              path="/workshop"
              element={
                <ProtectedRoute>
                  <WorkshopPage />
                </ProtectedRoute>
              }
            />
            {/*
              The catch-all renders inside the shell, so a wrong address is a page of this app
              rather than a bare error. nginx has already answered 404 for it; see nginx.conf.
            */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
