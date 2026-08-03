import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname`, so one image serves localhost, staging, a preview
 * deployment and production. `test/no-build-time-config.test.ts` fails the suite if
 * `import.meta.env.VITE_` ever reappears.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar would throw on its first
    // useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package ships a committed `dist`, but it is edited in the same working tree;
    // pre-bundling would freeze a stale copy of a package a sibling agent may be changing.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    sourcemap: true,
  },
  // 5172, which docs/ecosystem/23-tessera.md §10.1 allocates and calls "verified free, adjacent to
  // aetherholm-web's 5171 and in the gap before 5173, which is vite's default and is avoided".
  //
  // Re-verified here rather than trusted, by surveying every sibling's vite.config.ts at the time
  // of writing: 3001 worlds-web, 5170 site, 5171 aetherholm-web, 5180 hub-web, 5182 foresight-web,
  // 5183 admin-web, 5184 mint-web, 5185 foresight-admin-web, 5186 trade-web, 5187 market-web,
  // 5188 status-web, 5189 explorer-web, 5190 network-site, 5192 devportal-web, 5195 emberkin-web.
  // 5172 collides with none of them. (The doc's own claim that 5173 is "avoided" is the reason to
  // check: no sibling sits on 5173 today either, so the doc's survey and this one agree.)
  //
  // This is a developer convenience and nothing more: it is not the port the app is served on in
  // production, and nothing in the bundle knows about it. The port the app TALKS TO in dev is
  // 4022 — the port micro-tessera binds (`tessera/src/env.ts:DEFAULT_PORT`) — resolved at runtime
  // by src/lib/hosts.ts.
  server: { port: 5172 },
  preview: { port: 5172 },
})
