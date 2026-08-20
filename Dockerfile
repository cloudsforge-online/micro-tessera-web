# syntax=docker/dockerfile:1
#
# Two stages: build the bundle, then serve it. The final image contains no Node, no toolchain, no
# source and no secret — an SPA is static files, and everything else in the image is attack surface
# for something it does not need to do.
#
# THE IMAGE CARRIES NO ENVIRONMENT. It is built once, tagged once, and the same tag is promoted
# from staging to production; the hosts it talks to are resolved in the browser from the address
# the page was served on. There is deliberately no build arg for an API URL.
#
# AND IT CARRIES NO ART. The 784 PNGs of micro-tessera-assets are not in here: `/world-assets/` is
# mapped at the gateway by micro-deploy. Baking them in would mean rebuilding and re-promoting the
# client to change one chair, and would put a ~400 MB image on the critical path of a bundle whose
# whole argument is that it downloads nothing.

# The named context is the unpublished @cloudsforge/ui repository, mirroring the `link:` specifier
# in package.json. It disappears when the package is published; see the README.
#   docker build -t tessera-web --build-context uipkg=../ui .

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

# The linked package must exist before `pnpm install` resolves the `link:` dependency, and it is
# copied first because it changes far less often than this app's source.
COPY --from=uipkg packages/ui /ui/packages/ui
# esbuild reads the nearest tsconfig for each file it transforms, and the design system's extends
# the one at its repository root. Without it the build fails inside a file this app does not own.
COPY --from=uipkg tsconfig.base.json /ui/tsconfig.base.json

# pnpm-workspace.yaml carries the esbuild build-script allowance; without it the toolchain installs
# and then cannot run.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
# public/ is copied EXPLICITLY. The web template's Dockerfile once omitted it, and four frontends
# shipped images with no favicon in them while their own brand tests passed against the source tree
# — the artefact and the repository disagreed. Vite copies public/ into dist/ verbatim.
COPY public ./public
COPY src ./src

# The release identity: the git sha, stamped into the meta tag src/lib/obs.ts reads, so an error
# report names the deploy that produced it. It identifies the artefact; it does not configure it.
ARG RELEASE=dev
RUN sed -i "s|name=\"cf-release\" content=\"dev\"|name=\"cf-release\" content=\"${RELEASE}\"|" index.html \
 && pnpm build

# nginx-unprivileged: the server runs as uid 101 and listens on 8080. A static file server has no
# reason to be root, and a container that cannot become root cannot be made to write anywhere.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
# Into a folder INSIDE a folder, because that is what a Forge Worlds title is. `/worlds/tessera`,
# matching `base:` in vite.config.ts and every `location` in nginx.conf.
COPY --from=build /app/dist /usr/share/nginx/html/worlds/tessera

EXPOSE 8080

# Liveness only. It proves nginx is answering, not that the app works — a static server cannot know
# whether the API behind the page is healthy, and pretending otherwise is how a green probe
# outlives a broken product.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
